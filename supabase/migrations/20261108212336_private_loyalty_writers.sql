-- Keep privileged writers outside the exposed API schema. Public RPCs run
-- as the caller; private implementations validate auth.uid() and eligibility.
alter function public.register_referral(text) set schema private;
alter function public.claim_legacy_coupon(uuid) set schema private;

create function public.register_referral(p_code text) returns void
language sql security invoker set search_path = ''
as $$ select private.register_referral(p_code) $$;
revoke all on function public.register_referral(text) from public, anon;
grant execute on function public.register_referral(text) to authenticated;

create function public.claim_legacy_coupon(p_promotion_id uuid) returns void
language sql security invoker set search_path = ''
as $$ select private.claim_legacy_coupon(p_promotion_id) $$;
revoke all on function public.claim_legacy_coupon(uuid) from public, anon;
grant execute on function public.claim_legacy_coupon(uuid) to authenticated;
