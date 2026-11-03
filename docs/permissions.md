# Staff authority

The owner invites native members in Activity and assigns their Pier role in
Operator roles. New members are viewers. An invitation is not an active session.
Current native session, role revision and grant expiry are checked again inside
the atomic admission that writes stock, documents, audit and a successful result.

| Role | Business reads | Changes |
| --- | --- | --- |
| Owner | Complete business records, originals, typed fields, financial views and exports | Current owner commands and explicit provider approvals |
| Purchasing | Physical stock, supplier identities and purchasing cost evidence | Purchase preparation and exact human approval, subject to owner spend routing |
| Sales and Sales operations | Physical stock, basic customer identities, sales orders and customer prices | Native sales orders and quotes, subject to exact quote approval |
| Warehouse | Physical stock and operational receipt, pick, pack and dispatch records | Existing warehouse commands; an explicit physical grant narrows the operations below |
| Finance | Physical stock | No new financial authority; receivables remain owner-only |
| Viewer | Physical stock | No stock or commercial mutation |
| Agent | Physical stock and supplier identities; prepared results omit hidden costs | Existing preparation commands; no self-approval or stock posting |

The owner can hide purchasing costs from Purchasing and hide sales prices from
Sales. These switches remove role authority. They cannot confer costs on a
viewer, sales prices on warehouse staff, or private profiles on an accountant.
Hiding a commercial field also removes commands that require that field and
invalidates approval and send authority that depends on it. Role changes are
audited. A previous result can be recovered only by its original person under
the same current role revision, or reconciled by the current owner using that
person's original provenance. An owner cannot take another person's command
identity as their own.

An explicit physical grant names warehouses and optionally exact locations. It
may expire at an explicit UTC instant. Empty warehouses revoke physical access;
empty locations permit all locations in the named warehouses. Such a grant never
exposes cost, sales price, customer identity, arbitrary custom fields, supplier
originals or commercial exports. It permits stock reads and the physical scope
export, counts, scan receiving, picking, packing, dispatch and physical slips.
Only a committed purchase with a named permitted receiving warehouse is shown.
An ambiguous destination, foreign bin, mixed warehouse order or outside allocation
is refused. A wave release requires every bin in its warehouse; a short pick
cannot move a reservation to a bin outside the current grant. Receiving a raw
supplier notice, changing costs, setting up a carrier and closing or emailing an
installation-wide dispatch day still require wider authority.

Physical packing slips contain item identities, quantities, cartons and admitted
bins. They contain no customer identity, sales prices, costs or arbitrary fields.
They are freshly projected under current authority; a retained commercial PDF,
EDI original, carrier label, report, accounting file or full native export is an
owner door. Removing a grant denies the next read, action, document download and
recovered result. Refused admission writes no partial task, stock or successful
command result.

The adopted commercial default awaits ct approval: customer profiles, contacts,
addresses, terms, representatives, receivables, financial exports, arbitrary
typed-field content and field-bearing retained documents remain owner-only.
Wider explicit sales and accountant delegation remains an ADMIN-001 gap. SEC-002
inherits that gap. DATA-001 and DATA-002 preserve the existing archive and custody
obligations; new connector, model and document doors inherit the same current
authority and explicit egress requirements before shipping.

Agents can follow ordinary purchase drafts and commitments by supplier, reference, quantities, dates and approval status. Costs, supplier snapshots, private originals and dropship customer addresses stay hidden. Two different agents do not create human authority: neither can approve or commit the other's preparation. An owner or current purchasing approver reviews the exact commercial record.
