-- Fix the admin support inbox RPC returning auth.users.email (varchar) as text.
-- This aligns the runtime function return types and restores ticket listing.
CREATE OR REPLACE FUNCTION public.admin_list_vad_support_tickets(p_status text DEFAULT NULL::text)
RETURNS TABLE(
  id uuid,
  subject text,
  category text,
  status text,
  priority text,
  user_id uuid,
  user_email text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  last_message_at timestamp with time zone,
  last_message text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_status text := nullif(upper(trim(coalesce(p_status, ''))), '');
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('support.read') THEN
    RAISE EXCEPTION 'Support administration permission required.' USING errcode = '42501';
  END IF;

  IF v_status IS NOT NULL AND v_status NOT IN ('OPEN','IN_PROGRESS','WAITING_USER','RESOLVED','CLOSED') THEN
    RAISE EXCEPTION 'Choose a valid ticket status.' USING errcode = '22023';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.subject,
    t.category,
    t.status,
    t.priority,
    t.user_id,
    u.email::text,
    t.created_at,
    t.updated_at,
    t.last_message_at,
    (
      SELECT left(m.body, 240)
      FROM public.vad_support_messages m
      WHERE m.ticket_id = t.id
      ORDER BY m.created_at DESC
      LIMIT 1
    )
  FROM public.vad_support_tickets t
  JOIN auth.users u ON u.id = t.user_id
  WHERE v_status IS NULL OR t.status = v_status
  ORDER BY
    CASE t.status
      WHEN 'OPEN' THEN 0
      WHEN 'IN_PROGRESS' THEN 1
      WHEN 'WAITING_USER' THEN 2
      ELSE 3
    END,
    t.updated_at DESC
  LIMIT 300;
END;
$function$;
