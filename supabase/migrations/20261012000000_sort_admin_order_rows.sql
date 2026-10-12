-- migration-phase: expand
-- migration-safety: destructive-reviewed
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: supabase/migrations/20261012000000_sort_admin_order_rows.sql

-- Optional sort for the admin orders list. Drop the 6-arg overload so
-- existing calls keep resolving through the new defaults.

drop function if exists public.list_admin_order_rows(text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION "public"."list_admin_order_rows"("search_query" "text" DEFAULT NULL::"text", "source_filter" "text" DEFAULT NULL::"text", "order_status_filter" "text" DEFAULT NULL::"text", "payment_status_filter" "text" DEFAULT NULL::"text", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 10, "sort_column" "text" DEFAULT NULL::"text", "sort_direction" "text" DEFAULT NULL::"text") RETURNS TABLE("records" "jsonb", "total_rows" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(source_filter, '') as source_value,
      nullif(order_status_filter, '') as order_status_value,
      nullif(payment_status_filter, '') as payment_status_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size,
      case
        when sort_column in ('created_at', 'customer_label', 'order_total', 'remaining_receivable')
          and sort_direction in ('asc', 'desc')
        then sort_column
        else null
      end as sort_column_value,
      case
        when sort_column in ('created_at', 'customer_label', 'order_total', 'remaining_receivable')
          and sort_direction in ('asc', 'desc')
        then sort_direction
        else null
      end as sort_direction_value
  ),
  customer_order_totals as (
    select
      order_row.id as order_id,
      round(
        coalesce(
          sum(
            case
              when invoice.id is null then order_item.partial_quantity
              else order_item.final_quantity
            end * order_item.unit_price
          ),
          0
        ),
        2
      ) as total_amount,
      round(
        coalesce(
          sum(
            case
              when not (
                order_row.agent_id is not null
                or order_row.parent_order_id is not null
                or order_row.converted_at is not null
              ) then
                0
              when coalesce(order_item.agent_commission_amount, 0) > 0 then
                order_item.agent_commission_amount
              else
                coalesce(
                  private.calculate_product_agent_commission(
                    order_item.product_id,
                    case
                      when invoice.id is null then order_item.partial_quantity
                      else order_item.final_quantity
                    end,
                    order_item.unit_price
                  ),
                  0
                )
            end
          ),
          0
        ),
        2
      ) as commission_total
    from public."order" order_row
    left join public.invoice
      on invoice.order_id = order_row.id
    left join public.order_item
      on order_item.order_id = order_row.id
      and order_item.order_kind in ('customer', 'personal')
    where order_row.order_kind in ('customer', 'personal')
      and order_row.converted_at is null
    group by order_row.id
  ),
  customer_order_paid as (
    select
      order_row.id as order_id,
      round(coalesce(sum(payment.amount), 0), 2) as paid_total
    from public."order" order_row
    left join public.payment
      on payment.order_id = order_row.id
    where order_row.order_kind in ('customer', 'personal')
      and order_row.converted_at is null
    group by order_row.id
  ),
  distribution_order_totals as (
    select
      distribution_order.id as order_id,
      round(coalesce(sum(order_item.partial_quantity * product.default_price), 0), 2) as total_amount,
      round(
        coalesce(
          sum(
            case
              when coalesce(order_item.agent_commission_amount, 0) > 0 then
                order_item.agent_commission_amount
              else
                coalesce(
                  private.calculate_product_agent_commission(
                    order_item.product_id,
                    order_item.partial_quantity,
                    product.default_price
                  ),
                  0
                )
            end
          ),
          0
        ),
        2
      ) as commission_total
    from public."order" distribution_order
    left join public.order_item
      on order_item.order_id = distribution_order.id
      and order_item.order_kind = 'distribution'
    left join public.product
      on product.id = order_item.product_id
    where distribution_order.order_kind = 'distribution'
    group by distribution_order.id
  ),
  distribution_order_paid as (
    select
      distribution_order.id as order_id,
      round(coalesce(sum(payment.amount), 0), 2) as paid_total
    from public."order" distribution_order
    left join public."order" child_order
      on child_order.parent_order_id = distribution_order.id
      and child_order.order_kind in ('customer', 'personal')
      and child_order.converted_at is null
    left join public.payment
      on payment.order_id = child_order.id
    where distribution_order.order_kind = 'distribution'
    group by distribution_order.id
  ),
  distribution_order_payment as (
    select
      distribution_order.id as order_id,
      count(child_order.id)::integer as linked_customer_count,
      count(child_order.id) filter (where child_order.order_status = 'pending')::integer
        as pending_customer_order_count,
      case
        when count(child_order.id) = 0 then 'unpaid'
        when bool_and(child_order.payment_status = 'paid') then 'paid'
        when bool_and(child_order.payment_status = 'unpaid') then 'unpaid'
        else 'partial'
      end as payment_status
    from public."order" distribution_order
    left join public."order" child_order
      on child_order.parent_order_id = distribution_order.id
      and child_order.order_kind in ('customer', 'personal')
      and child_order.converted_at is null
    where distribution_order.order_kind = 'distribution'
    group by distribution_order.id
  ),
  distribution_order_customer_search as (
    select
      child_order.parent_order_id as distribution_order_id,
      lower(string_agg(
        trim(concat_ws(
          ' ',
          customer_person.first_name,
          customer_person.last_name,
          customer_person.phone_number,
          customer_person.email,
          customer_person.address
        )),
        ' '
      )) as customer_search_text
    from public."order" child_order
    join public.customer
      on customer.id = child_order.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where child_order.parent_order_id is not null
      and child_order.order_kind in ('customer', 'personal')
      and child_order.converted_at is null
    group by child_order.parent_order_id
  ),
  unified as (
    select
      distribution_order.id,
      'agent'::text as row_type,
      distribution_order.created_at,
      null::date as release_date,
      distribution_order.order_status as status,
      coalesce(agent_person.display_name, 'Agent order') as customer_label,
      'agent_submitted'::text as source,
      'Agent'::text as source_label,
      distribution_order_payment.payment_status,
      coalesce(distribution_order_totals.total_amount, 0) as total_amount,
      coalesce(distribution_order_totals.commission_total, 0) as commission_total,
      coalesce(distribution_order_paid.paid_total, 0) as paid_total,
      greatest(
        coalesce(distribution_order_totals.total_amount, 0)
        - coalesce(distribution_order_totals.commission_total, 0)
        - coalesce(distribution_order_paid.paid_total, 0),
        0
      ) as remaining_receivable,
      '/admin/orders/agent/' || distribution_order.id::text as href,
      distribution_order_payment.linked_customer_count,
      distribution_order_payment.pending_customer_order_count,
      lower(concat_ws(
        ' ',
        distribution_order.order_status,
        agent_person.display_name,
        agent_person.phone_number,
        distribution_order_customer_search.customer_search_text
      )) as search_text
    from public."order" distribution_order
    join public.agent agent_row
      on agent_row.id = distribution_order.agent_id
    join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join distribution_order_totals
      on distribution_order_totals.order_id = distribution_order.id
    left join distribution_order_payment
      on distribution_order_payment.order_id = distribution_order.id
    left join distribution_order_paid
      on distribution_order_paid.order_id = distribution_order.id
    left join distribution_order_customer_search
      on distribution_order_customer_search.distribution_order_id = distribution_order.id
    where distribution_order.order_kind = 'distribution'

    union all

    select
      order_row.id,
      'customer'::text as row_type,
      order_row.created_at,
      order_row.release_date,
      order_row.order_status as status,
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      order_row.source,
      case order_row.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(order_row.source, '_', ' '))
      end as source_label,
      order_row.payment_status,
      coalesce(customer_order_totals.total_amount, 0) as total_amount,
      coalesce(customer_order_totals.commission_total, 0) as commission_total,
      coalesce(customer_order_paid.paid_total, 0) as paid_total,
      greatest(
        coalesce(customer_order_totals.total_amount, 0)
        - coalesce(customer_order_totals.commission_total, 0)
        - coalesce(customer_order_paid.paid_total, 0),
        0
      ) as remaining_receivable,
      '/admin/orders/customer/' || order_row.id::text as href,
      null::integer as linked_customer_count,
      null::integer as pending_customer_order_count,
      lower(concat_ws(
        ' ',
        order_row.source,
        order_row.order_status,
        order_row.payment_status,
        customer_person.first_name,
        customer_person.last_name,
        customer_person.phone_number,
        customer_person.email,
        customer_person.address,
        agent_person.display_name
      )) as search_text
    from public."order" order_row
    join public.customer
      on customer.id = order_row.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    left join public.agent agent_row
      on agent_row.id = order_row.agent_id
    left join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join customer_order_totals
      on customer_order_totals.order_id = order_row.id
    left join customer_order_paid
      on customer_order_paid.order_id = order_row.id
    where order_row.order_kind in ('customer', 'personal')
      and order_row.parent_order_id is null
      and order_row.converted_at is null
  ),
  filtered as (
    select unified.*
    from unified
    cross join normalized
    where not (unified.status = 'closed' and unified.payment_status = 'paid')
      and (normalized.search_value is null or unified.search_text like '%' || normalized.search_value || '%')
      and (normalized.source_value is null or unified.source = normalized.source_value)
      and (normalized.order_status_value is null or unified.status = normalized.order_status_value)
      and (normalized.payment_status_value is null or unified.payment_status = normalized.payment_status_value)
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  ranked as (
    select
      counted.*,
      row_number() over (
        order by
          case
            when normalized.sort_column_value is null then counted.created_at
          end desc,
          case
            when normalized.sort_column_value = 'created_at' and normalized.sort_direction_value = 'asc' then counted.created_at
          end asc nulls last,
          case
            when normalized.sort_column_value = 'created_at' and normalized.sort_direction_value = 'desc' then counted.created_at
          end desc nulls last,
          case
            when normalized.sort_column_value = 'customer_label' and normalized.sort_direction_value = 'asc' then counted.customer_label
          end asc nulls last,
          case
            when normalized.sort_column_value = 'customer_label' and normalized.sort_direction_value = 'desc' then counted.customer_label
          end desc nulls last,
          case
            when normalized.sort_column_value = 'order_total' and normalized.sort_direction_value = 'asc'
              then greatest(counted.total_amount - counted.commission_total, 0)
          end asc nulls last,
          case
            when normalized.sort_column_value = 'order_total' and normalized.sort_direction_value = 'desc'
              then greatest(counted.total_amount - counted.commission_total, 0)
          end desc nulls last,
          case
            when normalized.sort_column_value = 'remaining_receivable' and normalized.sort_direction_value = 'asc'
              then counted.remaining_receivable
          end asc nulls last,
          case
            when normalized.sort_column_value = 'remaining_receivable' and normalized.sort_direction_value = 'desc'
              then counted.remaining_receivable
          end desc nulls last,
          case
            when normalized.sort_direction_value = 'asc' then counted.id
          end asc,
          case
            when normalized.sort_direction_value is distinct from 'asc' then counted.id
          end desc
      ) as sort_rank
    from counted
    cross join normalized
  ),
  paged as (
    select ranked.*
    from ranked
    cross join normalized
    where ranked.sort_rank > (normalized.safe_page_number - 1) * normalized.safe_page_size
      and ranked.sort_rank <= normalized.safe_page_number * normalized.safe_page_size
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'source' - 'total_rows' - 'sort_rank' order by paged.sort_rank),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function public.list_admin_order_rows(text, text, text, text, integer, integer, text, text) owner to postgres;

revoke all on function public.list_admin_order_rows(text, text, text, text, integer, integer, text, text) from public;
revoke all on function public.list_admin_order_rows(text, text, text, text, integer, integer, text, text) from anon;
revoke all on function public.list_admin_order_rows(text, text, text, text, integer, integer, text, text) from authenticated;
grant all on function public.list_admin_order_rows(text, text, text, text, integer, integer, text, text) to service_role;
