-- Keep the branch membership constraint and expose a direct relationship for
-- PostgREST embeds used by CRM inquiries, tasks and campaign reports.
alter table public.crm_inquiries
  add constraint crm_inquiries_contact_id_fkey
  foreign key (contact_id) references public.crm_contacts(id);

alter table public.crm_tasks
  add constraint crm_tasks_contact_id_fkey
  foreign key (contact_id) references public.crm_contacts(id);

alter table public.crm_campaign_recipients
  add constraint crm_campaign_recipients_contact_id_fkey
  foreign key (contact_id) references public.crm_contacts(id);

notify pgrst, 'reload schema';
