-- migration-phase: expand
-- migration-safety: destructive-reviewed
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: supabase/migrations/20261012000001_sort_admin_list_rows.sql

-- Optional sort for the admin sales, invoice, customer, and agent lists.
-- Drop the previous overloads so existing calls keep resolving through the new defaults.

drop function if exists public.list_admin_sales_rows(text, text, text, text, integer, integer);
drop function if exists public.list_admin_invoice_rows(text, text, integer, integer);
drop function if exists public.list_admin_customer_rows(text, text, integer, integer, uuid, uuid[], boolean);
drop function if exists public.list_admin_agent_rows(text, text, integer, integer);


CREATE OR REPLACE FUNCTION "public"."list_admin_sales_rows"("search_query" "text" DEFAULT NULL::"text", "source_filter" "text" DEFAULT NULL::"text", "order_status_filter" "text" DEFAULT NULL::"text", "payment_status_filter" "text" DEFAULT NULL::"text", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 10, "sort_column" "text" DEFAULT NULL::"text", "sort_direction" "text" DEFAULT NULL::"text") RETURNS TABLE("records" "jsonb", "total_rows" bigint)
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
        when sort_column in ('created_at', 'sale_date_value', 'customer_label', 'order_total', 'net_total', 'payment_count')
          and sort_direction in ('asc', 'desc')
        then sort_column
        else null
      end as sort_column_value,
      case
        when sort_column in ('created_at', 'sale_date_value', 'customer_label', 'order_total', 'net_total', 'payment_count')
          and sort_direction in ('asc', 'desc')
        then sort_direction
        else null
      end as sort_direction_value
  ),
  base_rows as (
    select
      order_row.id,
      order_row.created_at,
      order_row.sale_date as sale_date_value,
      order_row.sale_date::text as sale_date,
      order_row.release_date,
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      order_row.source,
      case order_row.source
        when 'guest_shop' then 'Shop'
        when 'agent_submitted' then 'Agent'
        when 'admin_manual' then 'Manual'
        else initcap(replace(order_row.source, '_', ' '))
      end as source_label,
      order_row.order_status,
      order_row.payment_status,
      invoice.invoice_number,
      coalesce(public.compute_invoice_total(order_row.id), 0) as order_total,
      round(
        greatest(
          coalesce(public.compute_invoice_total(order_row.id), 0)
          - coalesce(public.compute_expected_commission(order_row.id), 0),
          0
        ),
        2
      ) as net_total,
      coalesce(public.compute_payment_total(order_row.id), 0) as paid_total,
      coalesce(public.compute_payment_balance(order_row.id), 0) as balance,
      coalesce(payment_stats.payment_count, 0) as payment_count,
      '/admin/orders/customer/' || order_row.id::text as href,
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
        agent_person.display_name,
        invoice.invoice_number
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
    left join lateral (
      select invoice.invoice_number
      from public.invoice
      where invoice.order_id = order_row.id
      order by invoice.created_at desc, invoice.id desc
      limit 1
    ) invoice on true
    left join lateral (
      select count(*)::integer as payment_count
      from public.payment
      where payment.order_id = order_row.id
    ) payment_stats on true
    where order_row.order_kind in ('customer', 'personal')
      and order_row.order_status = 'closed'
      and order_row.payment_status = 'paid'
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (normalized.source_value is null or base_rows.source = normalized.source_value)
      and (normalized.order_status_value is null or base_rows.order_status = normalized.order_status_value)
      and (normalized.payment_status_value is null or base_rows.payment_status = normalized.payment_status_value)
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
            when normalized.sort_column_value is null then counted.sale_date_value
          end desc nulls last,
          case
            when normalized.sort_column_value = 'created_at' and normalized.sort_direction_value = 'asc' then counted.created_at
          end asc nulls last,
          case
            when normalized.sort_column_value = 'created_at' and normalized.sort_direction_value = 'desc' then counted.created_at
          end desc nulls last,
          case
            when normalized.sort_column_value = 'sale_date_value' and normalized.sort_direction_value = 'asc' then counted.sale_date_value
          end asc nulls last,
          case
            when normalized.sort_column_value = 'sale_date_value' and normalized.sort_direction_value = 'desc' then counted.sale_date_value
          end desc nulls last,
          case
            when normalized.sort_column_value = 'customer_label' and normalized.sort_direction_value = 'asc' then counted.customer_label
          end asc nulls last,
          case
            when normalized.sort_column_value = 'customer_label' and normalized.sort_direction_value = 'desc' then counted.customer_label
          end desc nulls last,
          case
            when normalized.sort_column_value = 'order_total' and normalized.sort_direction_value = 'asc' then counted.order_total
          end asc nulls last,
          case
            when normalized.sort_column_value = 'order_total' and normalized.sort_direction_value = 'desc' then counted.order_total
          end desc nulls last,
          case
            when normalized.sort_column_value = 'net_total' and normalized.sort_direction_value = 'asc' then counted.net_total
          end asc nulls last,
          case
            when normalized.sort_column_value = 'net_total' and normalized.sort_direction_value = 'desc' then counted.net_total
          end desc nulls last,
          case
            when normalized.sort_column_value = 'payment_count' and normalized.sort_direction_value = 'asc' then counted.payment_count
          end asc nulls last,
          case
            when normalized.sort_column_value = 'payment_count' and normalized.sort_direction_value = 'desc' then counted.payment_count
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
      jsonb_agg(to_jsonb(paged) - 'sale_date_value' - 'search_text' - 'source' - 'total_rows' - 'sort_rank' order by paged.sort_rank),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function public.list_admin_sales_rows(text, text, text, text, integer, integer, text, text) owner to postgres;

revoke all on function public.list_admin_sales_rows(text, text, text, text, integer, integer, text, text) from public;
revoke all on function public.list_admin_sales_rows(text, text, text, text, integer, integer, text, text) from anon;
revoke all on function public.list_admin_sales_rows(text, text, text, text, integer, integer, text, text) from authenticated;
grant all on function public.list_admin_sales_rows(text, text, text, text, integer, integer, text, text) to service_role;

CREATE OR REPLACE FUNCTION "public"."list_admin_invoice_rows"("search_query" "text" DEFAULT NULL::"text", "balance_status_filter" "text" DEFAULT NULL::"text", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 10, "sort_column" "text" DEFAULT NULL::"text", "sort_direction" "text" DEFAULT NULL::"text") RETURNS TABLE("records" "jsonb", "total_rows" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(balance_status_filter, '') as balance_status_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size,
      case
        when sort_column in ('invoice_created_at', 'customer_label', 'invoice_total', 'paid_total', 'balance')
          and sort_direction in ('asc', 'desc')
        then sort_column
        else null
      end as sort_column_value,
      case
        when sort_column in ('invoice_created_at', 'customer_label', 'invoice_total', 'paid_total', 'balance')
          and sort_direction in ('asc', 'desc')
        then sort_direction
        else null
      end as sort_direction_value
  ),
  base_rows as (
    select
      order_row.id as order_id,
      invoice.id as invoice_id,
      invoice.invoice_number,
      concat_ws(' ', customer_person.first_name, customer_person.last_name) as customer_label,
      invoice.created_at as invoice_created_at,
      coalesce(public.compute_invoice_total(order_row.id), 0) as invoice_total,
      coalesce(public.compute_payment_total(order_row.id), 0) as paid_total,
      coalesce(public.compute_payment_balance(order_row.id), 0) as balance,
      order_row.payment_status,
      lower(concat_ws(
        ' ',
        invoice.invoice_number,
        customer_person.first_name,
        customer_person.last_name,
        customer_person.phone_number,
        customer_person.email
      )) as search_text
    from public."order" order_row
    join public.invoice
      on invoice.order_id = order_row.id
    join public.customer
      on customer.id = order_row.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    where order_row.order_kind in ('customer', 'personal')
      and order_row.converted_at is null
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (normalized.balance_status_value is null or base_rows.payment_status = normalized.balance_status_value)
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
            when normalized.sort_column_value is null then counted.invoice_created_at
          end desc,
          case
            when normalized.sort_column_value = 'invoice_created_at' and normalized.sort_direction_value = 'asc' then counted.invoice_created_at
          end asc nulls last,
          case
            when normalized.sort_column_value = 'invoice_created_at' and normalized.sort_direction_value = 'desc' then counted.invoice_created_at
          end desc nulls last,
          case
            when normalized.sort_column_value = 'customer_label' and normalized.sort_direction_value = 'asc' then counted.customer_label
          end asc nulls last,
          case
            when normalized.sort_column_value = 'customer_label' and normalized.sort_direction_value = 'desc' then counted.customer_label
          end desc nulls last,
          case
            when normalized.sort_column_value = 'invoice_total' and normalized.sort_direction_value = 'asc' then counted.invoice_total
          end asc nulls last,
          case
            when normalized.sort_column_value = 'invoice_total' and normalized.sort_direction_value = 'desc' then counted.invoice_total
          end desc nulls last,
          case
            when normalized.sort_column_value = 'paid_total' and normalized.sort_direction_value = 'asc' then counted.paid_total
          end asc nulls last,
          case
            when normalized.sort_column_value = 'paid_total' and normalized.sort_direction_value = 'desc' then counted.paid_total
          end desc nulls last,
          case
            when normalized.sort_column_value = 'balance' and normalized.sort_direction_value = 'asc' then counted.balance
          end asc nulls last,
          case
            when normalized.sort_column_value = 'balance' and normalized.sort_direction_value = 'desc' then counted.balance
          end desc nulls last,
          case
            when normalized.sort_direction_value = 'asc' then counted.invoice_id
          end asc,
          case
            when normalized.sort_direction_value is distinct from 'asc' then counted.invoice_id
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
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' - 'sort_rank' order by paged.sort_rank),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function public.list_admin_invoice_rows(text, text, integer, integer, text, text) owner to postgres;

revoke all on function public.list_admin_invoice_rows(text, text, integer, integer, text, text) from public;
revoke all on function public.list_admin_invoice_rows(text, text, integer, integer, text, text) from anon;
revoke all on function public.list_admin_invoice_rows(text, text, integer, integer, text, text) from authenticated;
grant all on function public.list_admin_invoice_rows(text, text, integer, integer, text, text) to service_role;

create or replace function public.list_admin_customer_rows(
  search_query text default null,
  customer_type_filter text default null,
  page_number integer default 1,
  page_size integer default 10,
  assigned_agent_id_filter uuid default null,
  exclude_customer_ids uuid[] default null,
  include_unassigned_customers boolean default false,
  sort_column text default null,
  sort_direction text default null
) returns table(records jsonb, total_rows bigint)
  language sql stable
  security definer
  set search_path = ''
  as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(customer_type_filter, '') as customer_type_value,
      assigned_agent_id_filter as assigned_agent_id_value,
      exclude_customer_ids as exclude_customer_id_values,
      coalesce(include_unassigned_customers, false) as include_unassigned_customers_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size,
      case
        when sort_column in ('created_at', 'customer_name', 'is_reseller', 'assigned_agent_name', 'outstanding_credit_balance')
          and sort_direction in ('asc', 'desc')
        then sort_column
        else null
      end as sort_column_value,
      case
        when sort_column in ('created_at', 'customer_name', 'is_reseller', 'assigned_agent_name', 'outstanding_credit_balance')
          and sort_direction in ('asc', 'desc')
        then sort_direction
        else null
      end as sort_direction_value
  ),
  base_rows as (
    select
      customer.id,
      customer.tracking_number,
      customer_person.first_name,
      customer_person.last_name,
      customer_person.phone_number,
      customer_person.email,
      customer_person.address,
      customer.assigned_agent_id,
      customer.is_reseller,
      customer.credit_limit,
      customer.credit_limit_exceeded,
      private.compute_customer_credit_balance(customer.id) as outstanding_credit_balance,
      customer.created_at,
      customer.updated_at,
      assigned_agent_person.display_name as assigned_agent_name,
      lower(concat_ws(
        ' ',
        customer.tracking_number,
        customer_person.first_name,
        customer_person.last_name,
        customer_person.phone_number,
        customer_person.email,
        customer_person.address,
        assigned_agent_person.display_name
      )) as search_text
    from public.customer
    join public.profile customer_person
      on customer_person.id = customer.profile_id
    left join public.agent assigned_agent
      on assigned_agent.id = customer.assigned_agent_id
    left join public.profile assigned_agent_person
      on assigned_agent_person.id = assigned_agent.profile_id
    where customer.promoted_to_agent_id is null
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (
        normalized.customer_type_value is null
        or (normalized.customer_type_value = 'reseller' and base_rows.is_reseller)
        or (normalized.customer_type_value = 'retail' and not base_rows.is_reseller)
      )
      and (
        normalized.assigned_agent_id_value is null
        or base_rows.assigned_agent_id = normalized.assigned_agent_id_value
        or (
          normalized.include_unassigned_customers_value
          and base_rows.assigned_agent_id is null
        )
      )
      and (
        normalized.exclude_customer_id_values is null
        or cardinality(normalized.exclude_customer_id_values) = 0
        or not (base_rows.id = any(normalized.exclude_customer_id_values))
      )
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
            when normalized.sort_column_value = 'customer_name' and normalized.sort_direction_value = 'asc' then concat_ws(' ', counted.first_name, counted.last_name)
          end asc nulls last,
          case
            when normalized.sort_column_value = 'customer_name' and normalized.sort_direction_value = 'desc' then concat_ws(' ', counted.first_name, counted.last_name)
          end desc nulls last,
          case
            when normalized.sort_column_value = 'is_reseller' and normalized.sort_direction_value = 'asc' then counted.is_reseller
          end asc nulls last,
          case
            when normalized.sort_column_value = 'is_reseller' and normalized.sort_direction_value = 'desc' then counted.is_reseller
          end desc nulls last,
          case
            when normalized.sort_column_value = 'assigned_agent_name' and normalized.sort_direction_value = 'asc' then counted.assigned_agent_name
          end asc nulls last,
          case
            when normalized.sort_column_value = 'assigned_agent_name' and normalized.sort_direction_value = 'desc' then counted.assigned_agent_name
          end desc nulls last,
          case
            when normalized.sort_column_value = 'outstanding_credit_balance' and normalized.sort_direction_value = 'asc' then counted.outstanding_credit_balance
          end asc nulls last,
          case
            when normalized.sort_column_value = 'outstanding_credit_balance' and normalized.sort_direction_value = 'desc' then counted.outstanding_credit_balance
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
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' - 'sort_rank' order by paged.sort_rank),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function public.list_admin_customer_rows(text, text, integer, integer, uuid, uuid[], boolean, text, text) owner to postgres;

revoke all on function public.list_admin_customer_rows(text, text, integer, integer, uuid, uuid[], boolean, text, text) from public;
revoke all on function public.list_admin_customer_rows(text, text, integer, integer, uuid, uuid[], boolean, text, text) from anon;
revoke all on function public.list_admin_customer_rows(text, text, integer, integer, uuid, uuid[], boolean, text, text) from authenticated;
grant execute on function public.list_admin_customer_rows(text, text, integer, integer, uuid, uuid[], boolean, text, text) to service_role;

create or replace function public.list_admin_agent_rows(
  search_query text default null,
  status_filter text default null,
  page_number integer default 1,
  page_size integer default 10,
  sort_column text default null,
  sort_direction text default null
)
returns table (
  records jsonb,
  total_rows bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(status_filter, '') as status_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size,
      case
        when sort_column in ('created_at', 'display_name')
          and sort_direction in ('asc', 'desc')
        then sort_column
        else null
      end as sort_column_value,
      case
        when sort_column in ('created_at', 'display_name')
          and sort_direction in ('asc', 'desc')
        then sort_direction
        else null
      end as sort_direction_value
  ),
  base_rows as (
    select
      agent_row.id,
      agent_row.user_id,
      agent_row.customer_id,
      agent_row.employee_id,
      agent_person.first_name,
      agent_person.last_name,
      agent_person.display_name,
      agent_row.status,
      coalesce(auth_users.email, agent_person.email) as email,
      agent_person.phone_number as contact,
      agent_row.created_at,
      agent_row.updated_at,
      lower(concat_ws(
        ' ',
        agent_row.id::text,
        agent_row.employee_id,
        agent_person.first_name,
        agent_person.last_name,
        agent_person.display_name,
        coalesce(auth_users.email, agent_person.email),
        agent_person.phone_number,
        agent_row.status
      )) as search_text
    from public.agent agent_row
    join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join auth.users auth_users
      on auth_users.id = agent_row.user_id
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (normalized.status_value is null or base_rows.status = normalized.status_value)
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
            when normalized.sort_column_value = 'display_name' and normalized.sort_direction_value = 'asc' then counted.display_name
          end asc nulls last,
          case
            when normalized.sort_column_value = 'display_name' and normalized.sort_direction_value = 'desc' then counted.display_name
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
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' - 'sort_rank' order by paged.sort_rank),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

alter function public.list_admin_agent_rows(text, text, integer, integer, text, text) owner to postgres;

revoke all on function public.list_admin_agent_rows(text, text, integer, integer, text, text) from public;
revoke all on function public.list_admin_agent_rows(text, text, integer, integer, text, text) from anon;
revoke all on function public.list_admin_agent_rows(text, text, integer, integer, text, text) from authenticated;
grant all on function public.list_admin_agent_rows(text, text, integer, integer, text, text) to service_role;
