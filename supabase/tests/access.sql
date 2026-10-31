-- Run after the migration in a disposable Supabase database via supabase test db.
-- Fixtures are rolled back; no real user data should be used for tests.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values
('11111111-1111-4111-8111-111111111111','av-test-a@example.invalid'),
('22222222-2222-4222-8222-222222222222','av-test-b@example.invalid');
select ok((select relrowsecurity from pg_class where oid='public.av_products'::regclass),'products RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.av_imports'::regclass),'imports RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.av_runs'::regclass),'runs RLS enabled');
set local role anon;
select throws_ok($$select * from public.av_products$$,'42501',null,'anonymous cannot read products');
select throws_ok($$insert into public.av_products(id,name,category,price,stock,priority) values('ANON','Anon','Test',1,1,1)$$,'42501',null,'anonymous cannot insert');
select throws_ok($$select public.av_ingest('[]',0,0,'[]')$$,'42501',null,'anonymous cannot execute import RPC');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select lives_ok($$insert into public.av_products(id,name,category,price,stock,priority) values('A1','Owner A','Test',1,1,1)$$,'A can insert own product');
select is((select count(*)::integer from public.av_products),1,'A sees own record');
select throws_ok($$update public.av_products set name='Changed' where id='A1'$$,'42501',null,'update privilege is not exposed');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((select count(*)::integer from public.av_products),0,'B cannot read A records');
select throws_ok($$insert into public.av_products(owner_id,id,name,category,price,stock,priority) values('11111111-1111-4111-8111-111111111111','SPOOF','Bad','Test',1,1,1)$$,'42501',null,'B cannot write A records');
select lives_ok($$delete from public.av_products where id='A1'$$,'B deletion attempt returns without revealing A data');
select throws_ok($$insert into public.av_imports(owner_id,processed,accepted,duplicates) values('11111111-1111-4111-8111-111111111111',0,0,0)$$,'42501',null,'B cannot spoof import owner');
select throws_ok($$insert into public.av_runs(owner_id,kind,payload) values('11111111-1111-4111-8111-111111111111','route','{}')$$,'42501',null,'B cannot spoof run owner');
select lives_ok($$select public.av_ingest('[{"id":"B1","name":"Owner B","category":"Test","price":1,"stock":1,"priority":1}]',1,0,'[]')$$,'B can use atomic import RPC');
select is((select count(*)::integer from public.av_products),1,'B sees own imported product');
select is((select count(*)::integer from public.av_imports),1,'B sees own import receipt');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is((select count(*)::integer from public.av_products),1,'A still sees only A products');
select is((select count(*)::integer from public.av_imports),0,'A cannot see B receipt');
select lives_ok($$delete from public.av_products where id='A1'$$,'A can delete own product');
select is((select count(*)::integer from public.av_products),0,'owner deletion persisted inside transaction');
reset role;
select * from finish();
rollback;
