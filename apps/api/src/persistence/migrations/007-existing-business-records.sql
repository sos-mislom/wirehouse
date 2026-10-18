-- Bind unambiguous historical tenant tickets to their actual contract once.
WITH candidates AS (
 SELECT t.id,min(l.id) AS lease_id FROM warehouse.tickets t JOIN warehouse.leases l ON l.unit_id=t.unit_id AND l.tenant_id=t.tenant_id AND l.start_date<=t.created_at::date AND l.end_date>=t.created_at::date WHERE t.lease_id IS NULL GROUP BY t.id HAVING count(*)=1
) UPDATE warehouse.tickets t SET lease_id=c.lease_id FROM candidates c WHERE t.id=c.id;
-- Existing files retain their physical keys; the registry adds context without copying bytes.
INSERT INTO warehouse.entity_documents(id,property_id,name,category,stored_name,storage_kind,mime_type,url,uploaded_by,size_bytes,created_at,updated_at)
SELECT d.id,u.property_id,d.file_name,COALESCE(d.document_category,'other'),d.stored_name,'documents',COALESCE(d.mime_type,'application/octet-stream'),NULL,d.uploaded_by,d.size_bytes,d.created_at,d.created_at
FROM warehouse.lease_documents d JOIN warehouse.leases l ON l.id=d.lease_id JOIN warehouse.units u ON u.id=l.unit_id WHERE d.uploaded_by IS NOT NULL;
INSERT INTO warehouse.document_links(id,document_id,entity_type,entity_id,phase,revision,created_at)
SELECT md5('lease-doc:'||d.id),d.id,'leases',d.lease_id,'general',NULL,d.created_at FROM warehouse.lease_documents d WHERE d.uploaded_by IS NOT NULL;
INSERT INTO warehouse.entity_documents(id,property_id,name,category,stored_name,storage_kind,mime_type,url,uploaded_by,size_bytes,created_at,updated_at)
SELECT d.id,t.property_id,d.file_name,CASE WHEN d.mime_type LIKE 'image/%' THEN 'photo' ELSE 'other' END,d.stored_name,'tickets',COALESCE(d.mime_type,'application/octet-stream'),NULL,d.uploaded_by,d.size_bytes,d.created_at,d.created_at
FROM warehouse.ticket_attachments d JOIN warehouse.tickets t ON t.id=d.ticket_id WHERE d.uploaded_by IS NOT NULL;
INSERT INTO warehouse.document_links(id,document_id,entity_type,entity_id,phase,revision,created_at)
SELECT md5('ticket-doc:'||d.id),d.id,'tickets',d.ticket_id,'general',NULL,d.created_at FROM warehouse.ticket_attachments d WHERE d.uploaded_by IS NOT NULL;
-- Completed records enter acceptance; photo policies apply prospectively to new work.
WITH prepared AS (
 SELECT t.*, COALESCE(q.total,s.base_price,0) AS work_amount, (COALESCE(s.paid,false) OR COALESCE(q.total,0)>0) AS is_paid
 FROM warehouse.tickets t LEFT JOIN warehouse.service_catalog s ON s.id=t.service_id
 LEFT JOIN LATERAL (SELECT e.total FROM warehouse.estimates e WHERE e.ticket_id=t.id AND e.status IN ('submitted','approved','acted') ORDER BY e.updated_at DESC LIMIT 1) q ON true
)
INSERT INTO warehouse.ticket_workflows(ticket_id,account_id,acceptance_by,state,pause_reason,approval_by,paid,require_before_photo,require_after_photo,terms_version,approved_version,result_version,amount,updated_at)
SELECT id,NULL,NULL,CASE WHEN is_paid AND status NOT IN ('closed','rejected','completed','resolved') THEN 'awaiting_approval' ELSE CASE status WHEN 'closed' THEN 'closed' WHEN 'rejected' THEN 'rejected' WHEN 'completed' THEN 'awaiting_acceptance' WHEN 'resolved' THEN 'awaiting_acceptance' WHEN 'in_progress' THEN 'in_progress' WHEN 'waiting_tenant' THEN 'paused' ELSE CASE WHEN assigned_to IS NOT NULL THEN 'assigned' ELSE 'registered' END END END,NULL,NULL,is_paid,false,false,1,NULL,1,work_amount,updated_at FROM prepared;
INSERT INTO warehouse.entity_documents(id,property_id,name,category,stored_name,storage_kind,mime_type,url,uploaded_by,size_bytes,created_at,updated_at)
SELECT md5('act-doc:'||a.id),a.property_id,a.number||'.html','act',NULL,NULL,'text/html','service-act:'||a.id,a.issued_by,NULL,a.created_at,a.created_at FROM warehouse.service_acts a;
INSERT INTO warehouse.document_links(id,document_id,entity_type,entity_id,phase,revision,created_at)
SELECT md5('act-link:'||a.id),md5('act-doc:'||a.id),'tickets',a.ticket_id,'general',NULL,a.created_at FROM warehouse.service_acts a;
