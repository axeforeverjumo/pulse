# Odoo 18 Complete Reference Knowledge Base

Consolidated from 18 individual reference guides.
Source: https://github.com/unclecatvn/agent-skills/tree/main/skills/odoo-18.0/references

---


---

---
name: odoo-18-actions
description: Complete reference for Odoo 18 actions (ir.actions.*). Covers window actions, URL actions, server actions, report actions, client actions, scheduled actions, and action bindings.
globs: "**/*.{py,xml}"
topics:
  - Window actions (ir.actions.act_window)
  - URL actions (ir.actions.act_url)
  - Server actions (ir.actions.server)
  - Report actions (ir.actions.report)
  - Client actions (ir.actions.client)
  - Scheduled actions (ir.cron)
  - Action bindings (binding_model_id, binding_type)
when_to_use:
  - Creating menu items and action buttons
  - Defining window actions for models
  - Setting up scheduled/cron jobs
  - Configuring server actions for automation
  - Creating report actions
  - Implementing client-side actions
---

# Odoo 18 Actions Guide

Complete reference for Odoo 18 actions: window, URL, server, report, client, and scheduled actions with bindings.

## Table of Contents

1. [Action Basics](#action-basics)
2. [Window Actions](#window-actions)
3. [URL Actions](#url-actions)
4. [Server Actions](#server-actions)
5. [Report Actions](#report-actions)
6. [Client Actions](#client-actions)
7. [Scheduled Actions](#scheduled-actions)
8. [Action Bindings](#action-bindings)

---

## Action Basics

### What are Actions?

Actions define the behavior of the system in response to user actions: login, action button, selection of an invoice, etc.

### Common Action Attributes

All actions share these mandatory attributes:

| Attribute | Type | Description |
|-----------|------|-------------|
| `type` | string | Category of the action (determines available fields) |
| `name` | string | Short user-readable description |

### Action Forms

A client can receive actions in 4 forms:

| Form | Description |
|------|-------------|
| `False` | Close any open action dialog |
| String | Client action tag or number |
| Number | Database ID or external ID of an action record |
| Dictionary | Client action descriptor to execute |

---

## Window Actions

### `ir.actions.act_window` - Most Common Action

The most common action type, used to present visualizations of a model through views.

#### Window Action Fields

| Field | Type | Description |
|-------|------|-------------|
| `res_model` | string | Model to present views for (required) |
| `views` | list | List of `[(view_id, view_type)]` pairs |
| `res_id` | int | Record to load for form views (optional) |
| `search_view_id` | (id, name) | Specific search view to load (optional) |
| `target` | string | Where to open: `current`, `fullscreen`, `new`, `main` |
| `context` | dict | Additional context data for views |
| `domain` | list | Filtering domain for search queries |
| `limit` | int | Records to display in lists (default: 80) |

#### View Types

| Type | Description |
|------|-------------|
| `list` | List view (formerly `tree` in Odoo 17) |
| `form` | Form view |
| `graph` | Graph view |
| `pivot` | Pivot view |
| `kanban` | Kanban view |
| `calendar` | Calendar view |
| `gantt` | Gantt view |
| `map` | Map view |
| `activity` | Activity view |
| `search` | Search view |

### Window Action Examples

#### Basic List and Form Views

```xml
<record id="action_customer" model="ir.actions.act_window">
    <field name="name">Customers</field>
    <field name="res_model">res.partner</field>
    <field name="view_mode">list,form</field>
    <field name="domain">[('customer', '=', True)]</field>
</record>
```

#### Using Dictionary (Python)

```python
{
    "type": "ir.actions.act_window",
    "res_model": "res.partner",
    "views": [[False, "list"], [False, "form"]],
    "domain": [["customer", "=", true]],
}
```

#### Open Specific Record in Dialog

```python
{
    "type": "ir.actions.act_window",
    "res_model": "product.product",
    "views": [[False, "form"]],
    "res_id": a_product_id,
    "target": "new",
}
```

#### Custom Search View

```xml
<record id="action_sale_order" model="ir.actions.act_window">
    <field name="name">Sales Orders</field>
    <field name="res_model">sale.order</field>
    <field name="view_mode">list,form</field>
    <field name="search_view_id" ref="sale_view_search"/>
    <field name="context">{'default_user_id': uid}</field>
</record>
```

### In-Database Window Action Fields

These fields are used in XML data files:

| Field | Description |
|-------|-------------|
| `view_mode` | Comma-separated view types (no spaces!) |
| `view_ids` | M2M to view objects for initial views |
| `view_id` | Specific view to add if in view_mode |

```xml
<record model="ir.actions.act_window" id="test_action">
    <field name="name">A Test Action</field>
    <field name="res_model">some.model</field>
    <field name="view_mode">graph</field>
    <field name="view_id" ref="my_specific_view"/>
</record>
```

### ir.actions.act_window.view (Cleaner Approach)

```xml
<record model="ir.actions.act_window.view" id="test_action_tree">
   <field name="sequence" eval="1"/>
   <field name="view_mode">list</field>
   <field name="view_id" ref="view_test_list"/>
   <field name="act_window_id" ref="test_action"/>
</record>
```

---

## URL Actions

### `ir.actions.act_url` - Open Web Pages

Allow opening a URL (website/web page) via an Odoo action.

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Address to open (required) |
| `target` | string | `new`, `self`, or `download` (default: `new`) |

### URL Action Examples

```xml
<record id="action_open_documentation" model="ir.actions.act_url">
    <field name="name">Documentation</field>
    <field name="url">https://odoo.com</field>
    <field name="target">new</field>
</record>
```

```python
{
    "type": "ir.actions.act_url",
    "url": "https://odoo.com",
    "target": "self",  # Replaces current content
}
```

### Target Values

| Value | Description |
|-------|-------------|
| `new` | Opens URL in new window/page |
| `self` | Replaces current window/page content |
| `download` | Redirects to a download URL |

---

## Server Actions

### `ir.actions.server` - Execute Python Code

Allow triggering complex server code from any valid action location.

#### Server Action Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | In-database identifier of the server action |
| `model_id` | Many2one | Odoo model linked to the action |
| `state` | Selection | Type of action: `code`, `object_create`, `object_write`, `multi` |
| `code` | Text | Python code to execute (for `code` state) |
| `crud_model_id` | Many2one | Model for create actions |
| `child_ids` | One2many | Sub-actions for `multi` state |

### Server Action States

#### `code` - Execute Python Code

```xml
<record model="ir.actions.server" id="print_instance">
    <field name="name">Res Partner Server Action</field>
    <field name="model_id" ref="model_res_partner"/>
    <field name="state">code</field>
    <field name="code">
        raise Warning(record.name)
    </field>
</record>
```

#### Returning Next Action

```xml
<record model="ir.actions.server" id="open_related">
    <field name="name">Open Related Record</field>
    <field name="model_id" ref="model_res_partner"/>
    <field name="state">code</field>
    <field name="code">
        if record.some_condition():
            action = {
                "type": "ir.actions.act_window",
                "view_mode": "form",
                "res_model": record._name,
                "res_id": record.id,
            }
    </field>
</record>
```

#### `object_create` - Create New Record

```xml
<record model="ir.actions.server" id="create_task">
    <field name="name">Create Task from Lead</field>
    <field name="model_id" ref="model_crm_lead"/>
    <field name="state">object_create</field>
    <field name="crud_model_id" ref="model_project_task"/>
    <field name="link_field_id" ref="field_project_task_lead_id"/>
    <!-- fields_lines specifications -->
</record>
```

#### `object_write` - Update Current Record

```xml
<record model="ir.actions.server" id="mark_done">
    <field name="name">Mark as Done</field>
    <field name="model_id" ref="model_my_model"/>
    <field name="state">object_write</field>
    <!-- fields_lines specifications -->
</record>
```

#### `multi` - Execute Multiple Actions

```xml
<record model="ir.actions.server" id="multi_action">
    <field name="name">Multi Action</field>
    <field name="model_id" ref="model_res_partner"/>
    <field name="state">multi</field>
    <field name="child_ids" eval="[
        ref('action_create'),
        ref('action_notify'),
    ]"/>
</record>
```

### Evaluation Context

Available variables in server action code:

| Variable | Description |
|----------|-------------|
| `model` | Model object linked via `model_id` |
| `record` / `records` | Record/recordset action is triggered on (can be empty) |
| `env` | Odoo Environment |
| `datetime`, `dateutil`, `time`, `timezone` | Python modules |
| `log(message, level)` | Logging function (writes to ir.logging) |
| `Warning` | Constructor for Warning exception |

---

## Report Actions

### `ir.actions.report` - Print Reports

Triggers the printing of a report.

#### Report Action Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | File name (if `print_report_name` not specified) |
| `model` | string | Model the report is about (required) |
| `report_type` | string | `qweb-pdf` or `qweb-html` (default: `qweb-pdf`) |
| `report_name` | string | External ID of the QWeb template (required) |
| `print_report_name` | string | Python expression for report file name |
| `groups_id` | Many2many | Groups allowed to view/use the report |
| `multi` | boolean | If `True`, action not displayed on form view |
| `paperformat_id` | Many2one | Paper format to use |
| `attachment_use` | boolean | Generate once, then reprint from stored report |
| `attachment` | string | Python expression for attachment name |

### Report Action Examples

```xml
<report
    id="account_invoices"
    model="account.move"
    string="Invoices"
    report_type="qweb-pdf"
    name="account.report_invoice"
    file="account_report_invoice"
    print_report_name="'Invoice-{}-{}'.format(object.number or 'n/a', object.state)"
    groups_id="account.group_account_user"
    paperformat_id="account.paperformat_euro"
    attachment_use="True"
    attachment="'Invoice-'+str(object.number)+'.pdf'"/>
```

### Binding to Print Menu

To show in Print menu, specify `binding_model_id`:

```xml
<record id="report_my_report" model="ir.actions.report">
    <field name="name">My Report</field>
    <field name="model">my.model</field>
    <field name="report_type">qweb-pdf</field>
    <field name="report_name">my_module.my_report</field>
    <field name="binding_model_id" ref="model_my_model"/>
    <!-- binding_type defaults to 'report' automatically -->
</record>
```

---

## Client Actions

### `ir.actions.client` - Client-Side Actions

Triggers an action implemented entirely in the client (JavaScript).

| Field | Type | Description |
|-------|------|-------------|
| `tag` | string | Client-side identifier (arbitrary string) |
| `params` | dict | Additional data for the client |
| `target` | string | `current`, `fullscreen`, or `new` |

### Client Action Examples

```python
{
    "type": "ir.actions.client",
    "tag": "pos.ui"
}
```

```xml
<record id="action_client" model="ir.actions.client">
    <field name="name">Open POS</field>
    <field name="tag">pos.ui</field>
</record>
```

### Common Client Action Tags

| Tag | Description |
|-----|-------------|
| `pos.ui` | Point of Sale interface |
| `web_dashboard.open` | Open dashboard |
| `account.reload_view` | Reload account view |
| `bus.bus.reload` | Reload bus communication |

---

## Scheduled Actions

### `ir.cron` - Automated Actions

Actions triggered automatically on a predefined frequency.

#### Scheduled Action Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Name of the scheduled action |
| `interval_number` | int | Number of interval units between executions |
| `interval_type` | selection | `minutes`, `hours`, `days`, `weeks`, `months` |
| `model_id` | Many2one | Model on which action is called |
| `code` | Text | Code content to execute |
| `nextcall` | datetime | Next planned execution date |
| `priority` | int | Priority when executing multiple actions simultaneously |

### Scheduled Action Examples

```xml
<record id="ir_cron_send_quotation_email" model="ir.cron">
    <field name="name">Send Quotation Email</field>
    <field name="model_id" ref="model_sale_order"/>
    <field name="state">code</field>
    <field name="code">model._send_quotation_email()</field>
    <field name="interval_number">1</field>
    <field name="interval_type">hours</field>
    <field name="numbercall">-1</field>
    <field name="doall" eval="False"/>
    <field name="active" eval="True"/>
</record>
```

### Advanced: Batching

For long-running cron jobs, use batching API:

```python
self.env['ir.cron']._notify_progress(done=50, remaining=100)
```

This allows the scheduler to:
- Know if progress was made
- Determine if there's remaining work
- Process up to 10 batches in one sitting by default

### Advanced: Triggers

Trigger scheduled actions from business code:

```python
action_record._trigger(at=datetime(2025, 1, 1))
```

### Security Measures

- If a scheduled action encounters an error/timeout 3 consecutive times → skip execution, mark as failed
- If a scheduled action fails 5 consecutive times over at least 7 days → deactivate and notify DB admin

---

## Action Bindings

### Binding Attributes

Actions can be bound to contextual menus of models.

| Attribute | Type | Description |
|-----------|------|-------------|
| `binding_model_id` | Many2one | Model the action is bound to |
| `binding_type` | selection | `action` (default) or `report` |
| `binding_view_types` | string | Comma-separated: `list`, `form`, `list,form` (default) |

### Binding Examples

#### Action Binding (More Menu)

```xml
<record id="action_custom" model="ir.actions.server">
    <field name="name">Custom Action</field>
    <field name="model_id" ref="model_sale_order"/>
    <field name="state">code</field>
    <field name="code">
        # Do something
    </field>
    <field name="binding_model_id" ref="model_sale_order"/>
    <field name="binding_type">action</field>
    <field name="binding_view_types">list</field>
</record>
```

#### Report Binding (Print Menu)

```xml
<record id="report_custom" model="ir.actions.report">
    <field name="name">Custom Report</field>
    <field name="model">sale.order</field>
    <field name="report_type">qweb-pdf</field>
    <field name="report_name">sale.report_custom</field>
    <field name="binding_model_id" ref="model_sale_order"/>
    <!-- binding_type automatically 'report' for ir.actions.report -->
</record>
```

### Binding View Types

| Value | Description |
|-------|-------------|
| `list` | Shows in list view menu |
| `form` | Shows in form view menu |
| `list,form` | Shows in both (default) |

---

## Quick Reference

### Action Types Summary

| Type | Model | Use Case |
|------|-------|----------|
| Window | `ir.actions.act_window` | Open views for a model |
| URL | `ir.actions.act_url` | Open web page |
| Server | `ir.actions.server` | Execute Python code |
| Report | `ir.actions.report` | Print/generate report |
| Client | `ir.actions.client` | Execute JavaScript |
| Scheduled | `ir.cron` | Automated recurring action |

### Common Target Values

| Target | Description |
|--------|-------------|
| `current` | Open in main content area |
| `main` | Open in main area, clear breadcrumbs |
| `new` | Open in dialog/popup |
| `fullscreen` | Open in full screen mode |

### Returning Actions from Python

```python
# Window action
return {
    'type': 'ir.actions.act_window',
    'res_model': 'sale.order',
    'view_mode': 'form',
    'res_id': self.id,
}

# Refresh current view
return {
    'type': 'ir.actions.act_window_close',
}

# Reload entire client
return {
    'type': 'ir.actions.client',
    'tag': 'reload',
}
```

---

**For more Odoo 18 guides, see [SKILL.md](../SKILL.md)**


---

---
name: odoo-18-controller
description: Complete reference for Odoo 18 HTTP controllers, routing, authentication types, and request/response handling.
globs: "**/controllers/**/*.py"
topics:
  - Controller basics (class structure, request object)
  - route decorator (URL parameters, route options, multiroute)
  - Authentication types (auth types, user, public, none)
  - Request/Response types (http, json)
  - CSRF handling (protection, disable, tokens)
  - Common patterns (JSON endpoints, file download, website pages, API endpoints, error handling)
when_to_use:
  - Writing HTTP controllers
  - Creating API endpoints
  - Building website pages
  - Handling webhooks
  - Implementing file downloads
---

# Odoo 18 Controller Guide

Complete reference for Odoo 18 HTTP controllers, routing, and request handling.

## Table of Contents

1. [Controller Basics](#controller-basics)
2. [@route Decorator](#route-decorator)
3. [Authentication Types](#authentication-types)
4. [Request/Response Types](#requestresponse-types)
5. [CSRF Handling](#csrf-handling)
6. [Common Patterns](#common-patterns)

---

## Controller Basics

### Controller Class Structure

```python
from odoo import http
from odoo.http import request

class MyController(http.Controller):

    @http.route('/my/path', type='http', auth='user')
    def my_handler(self, **kwargs):
        return request.render('my_module.template', {
            'records': request.env['my.model'].search([]),
        })
```

**Key points**:
- Extend `http.Controller`
- Use `@http.route()` decorator
- Access `request` for environment and data
- Return appropriate response type

### Request Object

```python
# Environment access (same as model.env)
request.env  # Current environment
request.env.user  # Current user
request.env.company  # Current company
request.env.lang  # Current language

# Session access
request.session  # Current session dict
request.session['key'] = 'value'  # Set session value
request.session.get('key')  # Get session value

# HTTP data
request.httprequest  # Werkzeug request object
request.params  # URL parameters
request.csrf_token()  # Current CSRF token

# Database
request.db  # Current database name
request.cr  # Database cursor (rarely needed)
```

---

## @route Decorator

### Basic Route

```python
from odoo import http

@http.route('/hello', type='http', auth='user')
def hello(self):
    return "Hello World!"
```

### URL Parameters

```python
# Path parameter
@http.route('/order/<int:order_id>', type='http', auth='user')
def order_view(self, order_id):
    order = request.env['sale.order'].browse(order_id)
    if not order.exists():
        return request.not_found()
    return request.render('sale.order_view', {'order': order})

# Query parameters
@http.route('/search', type='http', auth='user')
def search_orders(self, **kwargs):
    domain = []
    if kwargs.get('name'):
        domain.append(('name', 'ilike', kwargs['name']))
    orders = request.env['sale.order'].search(domain)
    return request.render('sale.order_list', {'orders': orders})
```

### Route Options

```python
@http.route(
    '/my/path',                    # Route path
    type='http',                   # 'http' or 'json'
    auth='user',                   # 'public', 'user', 'none'
    methods=['GET', 'POST'],       # Allowed HTTP methods
    csrf=True,                     # CSRF validation
    website=True,                  # Website route (render with website layout)
    sitemap=False,                 # Include in sitemap
    save_session=True,             # Save session after request
)
def my_handler(self):
    pass
```

### Multiroute (Same Handler, Multiple Paths)

```python
@http.route('/path1')
@http.route('/path2')
def my_handler(self):
    return "Same handler for both paths"
```

---

## Authentication Types

### auth='user' (Default)

**Requires**: Logged-in user

```python
@http.route('/my/orders', type='http', auth='user')
def my_orders(self):
    # request.env.user is available
    orders = request.env['sale.order'].search([
        ('user_id', '=', request.env.user.id)
    ])
    return request.render('my_orders', {'orders': orders})
```

**Behavior**:
- Redirects to login if not authenticated
- `request.env.uid` is the logged-in user
- Normal record access rules apply

### auth='public'

**Allows**: Access without login (with access rights)

```python
@http.route('/shop/products', type='http', auth='public')
def shop_products(self):
    # Public can access, but respects access rights
    products = request.env['product.product'].search([
        ('website_published', '=', True)
    ])
    return request.render('shop_products', {'products': products})
```

**Behavior**:
- No redirect to login
- `request.env.uid` is anonymous (usually 3-4)
- Access rights still enforced (public user has limited access)
- Use `sudo()` to bypass access rights if needed

### auth='none'

**Allows**: No environment, no access rights

```python
@http.route('/web/webclient/locale', type='http', auth='none')
def get_locale(self):
    # No environment available - no request.env
    # Return static data
    return request.make_json_response({
        'lang': 'en_US',
        'direction': 'ltr',
    })
```

**Behavior**:
- `request.env` is NOT available
- No database access
- For truly public, static endpoints
- Used for login pages, health checks

---

## Request/Response Types

### type='http' - HTML/Text Response

```python
from odoo.http import request

# Render QWeb template
@http.route('/page', type='http', auth='user')
def my_page(self):
    return request.render('my_module.template', {
        'records': request.env['my.model'].search([]),
    })

# Return plain text
@http.route('/ping', type='http', auth='none')
def ping(self):
    return "PONG"

# Return HTML directly
@http.route('/html', type='http', auth='user')
def html_response(self):
    return "<h1>Hello</h1>"

# Make response with headers
@http.route('/download', type='http', auth='user')
def download_file(self):
    return request.make_response(
        data,
        headers=[
            ('Content-Type', 'application/pdf'),
            ('Content-Disposition', 'attachment; filename="file.pdf"'),
        ]
    )

# Redirect
@http.route('/redirect', type='http', auth='user')
def redirect_example(self):
    return request.redirect('/target/url')
```

### type='json' - JSON-RPC Response

```python
@http.route('/api/action', type='json', auth='user')
def json_action(self, **kwargs):
    # For JSON-RPC, return data directly (converted to JSON)
    record = request.env['my.model'].browse(kwargs.get('id'))
    return {
        'status': 'success',
        'data': {
            'name': record.name,
            'value': record.value,
        }
    }

# JSON endpoints are called from frontend
// Frontend call
this.rpc('/api/action', {id: 123}).then(result => {
    console.log(result);
});
```

**type='json' behavior**:
- Automatically serializes return value to JSON
- Used for frontend JavaScript calls
- CSRF token handled automatically from frontend

---

## CSRF Handling

### CSRF Protection (Default)

```python
# CSRF enabled by default for POST
@http.route('/form/submit', type='http', auth='user', methods=['POST'])
def form_submit(self, **kwargs):
    # CSRF token validated automatically
    # Process form data...
    return "Form submitted"
```

### Disable CSRF (Use Carefully)

```python
# For external webhooks, payment callbacks
@http.route('/webhook/payment', type='http', auth='none', csrf=False)
def payment_webhook(self):
    # Verify request another way (signature, IP whitelist)
    # Process webhook...
    return "OK"
```

### CSRF Token in Forms

```xml
<!-- QWeb template with CSRF token -->
<form t-action="/form/submit" method="POST">
    <input type="hidden" name="csrf_token" t-att-value="request.csrf_token()"/>
    <!-- other fields -->
</form>
```

---

## Common Patterns

### JSON Endpoint for Frontend

```python
from odoo import http
from odoo.http import request

class MyController(http.Controller):

    @http.route('/my/data', type='json', auth='user')
    def get_data(self, domain=None, fields=None):
        """JSON endpoint for frontend widgets"""
        domain = domain or []
        fields = fields or ['id', 'name', 'date']

        records = request.env['my.model'].search_read(domain, fields)
        return {
            'records': records,
            'count': len(records),
        }

    @http.route('/my/action', type='json', auth='user')
    def do_action(self, record_id, action_type):
        """Handle action from frontend"""
        record = request.env['my.model'].browse(record_id)
        if not record.exists():
            return {'error': 'Record not found'}

        if action_type == 'validate':
            record.action_validate()
        elif action_type == 'cancel':
            record.action_cancel()

        return {'success': True, 'status': record.state}
```

### File Download

```python
from odoo import http
from odoo.http import request

class DownloadController(http.Controller):

    @http.route('/download/report/<int:report_id>', type='http', auth='user')
    def download_report(self, report_id):
        """Download generated report"""
        report = request.env['ir.actions.report'].browse(report_id)

        # Get the report content
        pdf_content, _ = report._render_qweb_pdf([report_id])

        return request.make_response(
            pdf_content,
            headers=[
                ('Content-Type', 'application/pdf'),
                ('Content-Disposition', f'attachment; filename="{report.name}.pdf"'),
            ]
        )

    @http.route('/download/attachment/<int:attachment_id>', type='http', auth='user')
    def download_attachment(self, attachment_id):
        """Download attachment"""
        attachment = request.env['ir.attachment'].browse(attachment_id)
        if not attachment.exists():
            return request.not_found()

        return request.make_response(
            attachment.datas,
            headers=[
                ('Content-Type', attachment.mimetype),
                ('Content-Disposition', f'attachment; filename="{attachment.name}"'),
            ]
        )
```

### Website Page

```python
from odoo import http
from odoo.http import request

class WebsiteController(http.Controller):

    @http.route('/shop', type='http', auth='public', website=True)
    def shop(self, **kwargs):
        """Website shop page"""
        products = request.env['product.product'].search([
            ('website_published', '=', True),
            ('sale_ok', '=', True),
        ])

        # Get cart
        cart = request.website.sale_get_order()

        return request.render('website_shop.shop', {
            'products': products,
            'cart': cart,
        })

    @http.route('/shop/product/<model("product.product"):product>', type='http', auth='public', website=True)
    def product(self, product, **kwargs):
        """Product detail page"""
        return request.render('website_shop.product', {
            'product': product,
            'related_products': product.product_tmpl_id.product_variant_ids,
        })
```

### API Endpoint (External Integration)

```python
from odoo import http
from odoo.http import request

class ApiController(http.Controller):

    @http.route('/api/v1/orders', type='json', auth='user', csrf=False)
    def api_orders(self, domain=None, limit=80):
        """External API endpoint"""
        # Use sudo() to ensure access, or validate access manually
        orders = request.env['sale.order'].sudo().search(
            domain or [],
            limit=limit
        )
        return orders.read(['name', 'state', 'amount_total'])

    @http.route('/api/v1/order/<int:order_id>', type='json', auth='user', methods=['GET'])
    def api_order_get(self, order_id):
        """Get single order"""
        order = request.env['sale.order'].sudo().browse(order_id)
        if not order.exists():
            return request.make_json_response(
                {'error': 'Order not found'},
                status=404
            )
        return order.read([])[0]
```

### Error Handling

```python
from odoo import http
from odoo.http import request
from odoo.exceptions import UserError, AccessError

class MyController(http.Controller):

    @http.route('/action', type='json', auth='user')
    def do_action(self, record_id):
        try:
            record = request.env['my.model'].browse(record_id)
            record.action_validate()
            return {'success': True}
        except AccessError:
            return {
                'error': 'Access denied',
                'error_type': 'access_error'
            }
        except UserError as e:
            return {
                'error': str(e),
                'error_type': 'user_error'
            }
        except Exception as e:
            return {
                'error': 'An error occurred',
                'error_type': 'system_error'
            }

    @http.route('/page', type='http', auth='user')
    def my_page(self):
        try:
            data = self._get_data()
            return request.render('template', {'data': data})
        except Exception:
            return request.redirect('/error')
```

### Response Methods Reference

```python
# Render template with website layout
request.render('module.template', values)

# Render with custom response
request.make_response(html, headers=[...])

# JSON response
request.make_json_response({'key': 'value'})

# Redirect
request.redirect('/target/url')

# 404 Not Found
request.not_found()

# HTTP error
request.make_json_response({'error': 'message'}, status=400)
```

---

## Controller Best Practices

1. **Keep controllers thin** - Move business logic to models
2. **Use appropriate auth** - Don't use `sudo()` unless necessary
3. **Validate input** - Check parameters before database operations
4. **Handle exceptions** - Return meaningful error messages
5. **Use correct type** - `json` for frontend, `http` for pages
6. **Respect CSRF** - Only disable for external APIs
6. **Return proper responses** - Use correct response methods


---

---
name: odoo-18-data
description: Complete reference for Odoo 18 data files covering XML data files, CSV data files, record tags, field tags, shortcuts (menuitem, template, asset), function tags, delete tags, and noupdate attribute.
globs: "**/*.{xml,csv}"
topics:
  - XML data files structure
  - record tag (create/update records)
  - field tag (set field values)
  - delete tag (remove records)
  - function tag (call model methods)
  - Shortcuts (menuitem, template, asset)
  - CSV data files
  - noupdate attribute
  - search and ref in fields
when_to_use:
  - Creating data files for modules
  - Defining views, menus, actions
  - Setting up default data
  - Creating demo data
  - Understanding record references
---

# Odoo 18 Data Files Guide

Complete reference for Odoo 18 data files: XML structure, records, fields, shortcuts, and CSV files.

## Table of Contents

1. [Data File Structure](#data-file-structure)
2. [record Tag](#record-tag)
3. [field Tag](#field-tag)
4. [delete Tag](#delete-tag)
5. [function Tag](#function-tag)
6. [Shortcuts](#shortcuts)
7. [CSV Data Files](#csv-data-files)
8. [noupdate Attribute](#noupdate-attribute)
9. [Data Processing Patterns (Partner Merge)](#data-processing-patterns-partner-merge)

---

## Data File Structure

### Basic XML Data File

```xml
<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <data noupdate="1">
        <!-- Operations here -->
    </data>

    <!-- (Re)Loaded at install and update -->
    <operation/>
</odoo>
```

### Root Element

All data files must have `<odoo>` as root element containing operations.

### Data Elements

Operations are executed sequentially:
- Earlier operations can be referenced by later operations
- Later operations cannot reference earlier operations

### File Locations

| Location | When Used |
|----------|-----------|
| `data/` | Always loaded at install/update |
| `demo/` | Only in demo mode |

---

## record Tag

### Creating Records

```xml
<record id="partner_1" model="res.partner">
    <field name="name">Odoo</field>
    <field name="email">info@odoo.com</field>
    <field name="is_company" eval="True"/>
    <field name="customer" eval="False"/>
</record>
```

### Record Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | No* | External identifier (strongly recommended) |
| `model` | string | Yes | Model name |
| `context` | dict | No | Context for creation |
| `forcecreate` | bool | No | Create if doesn't exist in update mode (default: True) |

### Updating Records

If `id` exists, record is updated instead of created:

```xml
<!-- First time: creates -->
<record id="partner_1" model="res.partner">
    <field name="name">Odoo</field>
</record>

<!-- Second time: updates -->
<record id="partner_1" model="res.partner">
    <field name="email">newemail@odoo.com</field>
</record>
```

### No Fields = No Change

```xml
<!-- Does nothing on update -->
<record id="existing_record" model="res.partner"/>
```

---

## field Tag

### field Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `name` | string | Field name (required) |
| `ref` | string | External ID reference |
| `search` | domain | Search for relational field |
| `eval` | expression | Python expression |
| `type` | string | Interpretation type |

### Setting Values

#### No Value = False

```xml
<record id="record" model="my.model">
    <field name="my_field"/>  <!-- Sets to False -->
</record>
```

#### Direct Value

```xml
<field name="name">My Name</field>
<field name="code">123</field>
<field name="active">True</field>
```

#### eval - Python Expression

```xml
<field name="value" eval="42"/>
<field name="total" eval="10 + 20"/>
<field name="now" eval="datetime.datetime.now()"/>
<field name="list" eval="[(4, ref('base.group_user'))]"/>
```

### eval Context

Available in `eval`:

| Variable | Description |
|----------|-------------|
| `time` | Python `time` module |
| `datetime` | Python `datetime` module |
| `timedelta` | Python `timedelta` module |
| `relativedelta` | `dateutil.relativedelta` |
| `ref()` | Resolve external ID |
| `obj` | Current model (for field-specific) |

```xml
<field name="date" eval="datetime.date.today()"/>
<field name="next_week" eval="datetime.date.today() + relativedelta.relativedelta(weeks=1)"/>
```

#### ref - External ID Reference

```xml
<field name="user_id" ref="base.user_admin"/>
<field name="group_id" ref="base.group_user"/>
<field name="view_id" ref="my_module.my_view"/>
```

```xml
<!-- With ref in eval -->
<field name="groups_id" eval="[(6, 0, [ref('base.group_user'), ref('base.group_system')])]"/>
```

#### search - Domain Search

For relational fields, search for records:

```xml
<!-- Search for partner -->
<record id="record" model="my.model">
    <field name="partner_id" search="[('name', '=', 'Odoo')]"/>
</record>

<!-- Search with multiple results (first used for Many2one) -->
<field name="country_id" search="[('code', '=', 'US')]"/>
```

### type - Interpretation Type

| Type | Description |
|------|-------------|
| `xml` / `html` | Extract children as document |
| `file` | File path (stores as `module,path`) |
| `char` | Direct string value |
| `base64` | Base64 encode content |
| `int` | Convert to integer |
| `float` | Convert to float |
| `list` / `tuple` | List of values |

#### type="xml" / type="html"

```xml
<field name="description" type="xml">
    <p>This is <strong>formatted</strong> content.</p>
    <a href="%(link)s">Click here</a>
</field>
```

#### type="file"

```xml
<field name="image" type="file" name="my_module/static/img/logo.png"/>
<!-- Stores as: my_module,/static/img/logo.png -->
```

#### type="base64"

```xml
<field name="file_data" type="base64" file="my_module/static/data/file.bin"/>
```

#### type="list"

```xml
<field name="my_list" type="list">
    <value>1</value>
    <value>2</value>
    <value>3</value>
</field>
```

#### type="int" / type="float"

```xml
<field name="count" type="int">42</field>
<field name="price" type="float">19.99</field>
```

### Relational Fields

#### Many2one

```xml
<field name="partner_id" ref="base.main_partner"/>
<field name="user_id" ref="base.user_admin"/>
<field name="category_id" search="[('name', '=', 'Customers')]"/>
```

#### One2many / Many2many

Using Command values:

| Command | Description | Format |
|---------|-------------|--------|
| 0 | Create | `(0, 0, {values})` |
| 1 | Update | `(1, id, {values})` |
| 2 | Remove | `(2, id)` |
| 3 | Unlink | `(3, id)` |
| 4 | Link | `(4, id)` |
| 5 | Clear | `(5, )` |
| 6 | Replace | `(6, 0, [ids])` |

```xml
<record id="my_record" model="my.model">
    <!-- Create new line -->
    <field name="line_ids" eval="[
        (0, 0, {'name': 'Line 1', 'price': 100}),
        (0, 0, {'name': 'Line 2', 'price': 200}),
    ]"/>

    <!-- Link existing records -->
    <field name="tag_ids" eval="[(6, 0, [ref('tag_1'), ref('tag_2')])]"/>

    <!-- Clear all -->
    <field name="line_ids" eval="[(5,)]"/>

    <!-- Replace with new set -->
    <field name="tag_ids" eval="[(6, 0, [ref('tag_3')])]"/>
</record>
```

---

## delete Tag

### Deleting Records

```xml
<delete model="res.partner" id="partner_to_delete"/>
```

### delete Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model to delete from |
| `id` | string | No* | External ID to delete |
| `search` | domain | No* | Domain to find records |

`id` and `search` are mutually exclusive.

### Delete by External ID

```xml
<delete model="ir.ui.view" id="my_module.old_view"/>
```

### Delete by Search

```xml
<delete model="res.partner" search="[('name', '=', 'Test Partner')]"/>
```

### Delete Multiple

```xml
<delete model="ir.rule" search="[('domain_force', '=', False)]"/>
```

---

## function Tag

### Calling Model Methods

```xml
<function model="res.partner" name="send_notification">
    <!-- Parameters via value elements -->
    <value eval="[[ref('partner_1'), ref('partner_2')]]"/>
</function>
```

### function Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model to call method on |
| `name` | string | Yes | Method name |
| `eval` | expression | No | Parameters as expression |

### Parameters via eval

```xml
<function model="res.partner" name="create" eval="[
    {'name': 'Partner from XML', 'email': 'test@example.com'}
]"/>
```

### Parameters via value

```xml
<function model="my.model" name="my_method">
    <value>arg1</value>
    <value>arg2</value>
</function>
```

### Nested function

```xml
<function model="res.partner" name="send_vip_inscription_notice">
    <function eval="[[('vip', '=', True)]]" model="res.partner" name="search"/>
</function>
```

### Common Use Cases

```xml
<!-- Recompute views -->
<function model="ir.ui.view" name="search"/>

<!-- Clear cache -->
<function model="ir.cron" name="_process_job"/>

<!-- Call module hook -->
<function model="my.module" name="post_init_hook">
    <value eval="[]"/>
</function>
```

---

## Shortcuts

### menuitem Shortcut

Creates `ir.ui.menu` with defaults:

```xml
<menuitem id="menu_root" name="My Module"/>
```

#### menuitem Attributes

| Attribute | Description |
|-----------|-------------|
| `id` | External ID |
| `name` | Menu name (defaults to id if not set) |
| `parent` | Parent menu (external ID or name path) |
| `action` | Action to execute (external ID) |
| `groups` | Comma-separated group external IDs (prefix with `-` to remove) |

#### Menu Hierarchy

```xml
<!-- Top level -->
<menuitem id="menu_root" name="My Module" sequence="10"/>

<!-- Child (using parent) -->
<menuitem id="menu_sub" name="Sub Menu" parent="menu_root" sequence="1"/>

<!-- Child (using path - auto-creates intermediate) -->
<menuitem id="menu_deep" name="Deep Menu" parent="menu_root/Sub Menu" action="action_my"/>

<!-- With action -->
<menuitem id="menu_action" name="My Action" action="action_my_model"/>
```

#### Groups

```xml
<!-- Only for managers -->
<menuitem id="menu_manager" name="Manager" groups="base.group_system"/>

<!-- Remove group from menu -->
<menuitem id="menu_employees" name="Employees" groups="base.group_user,-base.group_system"/>
```

### template Shortcut

Creates `ir.ui.view` for QWeb template:

```xml
<template id="my_template" name="My Template">
    <div>
        <h1>Hello World</h1>
    </div>
</template>
```

#### template Attributes

| Attribute | Description |
|-----------|-------------|
| `id` | External ID (required) |
| `name` | View name |
| `inherit_id` | Parent template to inherit from |
| `priority` | View priority |
| `primary` | Set as primary view with inheritance |
| `groups` | Comma-separated group external IDs |
| `active` | Whether view is active |

```xml
<!-- Basic template -->
<template id="website_my_template">
    <div>
        <t t-foreach="docs" t-as="doc">
            <span t-field="doc.name"/>
        </t>
    </div>
</template>

<!-- Inheritance -->
<template id="inherit_template" inherit_id="website.my_template" priority="10">
    <xpath expr="//div" position="inside">
        <p>Inherited content</p>
    </xpath>
</template>

<!-- Primary inheritance -->
<template id="primary_template" inherit_id="base.template" primary="True">
    <!-- Primary template for this view -->
</template>

<!-- With groups -->
<template id="manager_template" groups="base.group_system">
    <!-- Only visible to system group -->
</template>

<!-- Active control -->
<template id="conditional_template" active="False">
    <!-- Inactive by default (XPath rules won't apply) -->
</template>
```

### asset Shortcut

Creates `ir.asset` record:

```xml
<asset id="website_something.style_asset" name="Some Style Asset">
    <bundle>web.assets_frontend</bundle>
    <path>website_something/static/src/some_style.scss</path>
</asset>
```

#### asset Attributes

| Attribute | Description |
|-----------|-------------|
| `id` | External ID (required) |
| `name` | Asset name |
| `active` | Whether asset is active |

#### asset Child Elements

| Element | Description |
|---------|-------------|
| `<bundle>` | Asset bundle name |
| `<path>` | File path |
| `<directive>` | Directive (include, replace, etc.) |

```xml
<asset id="my_module.assets" name="My Assets" active="True">
    <bundle>web.assets_frontend</bundle>
    <path>my_module/static/src/js/main.js</path>
    <path>my_module/static/src/scss/style.scss</path>
    <field name="directive">replace</field>
</asset>
```

---

## CSV Data Files

### CSV Structure

```
my_module/
└── data/
    └── res_country_state.csv
```

### CSV Format

- File name: `{model_name}.csv`
- First row: Field names including `id` for external IDs
- Each subsequent row: One record

### Example: Country States

```csv
id,country_id,name,code
state_au_nsw,country_au,New South Wales,NSW
state_au_vic,country_au,Victoria,VIC
state_au_qld,country_au,Queensland,QLD
```

### CSV Fields

| Column | Description |
|--------|-------------|
| `id` | External ID (for create/update) |
| `country_id:id` | Reference to country (external ID) |
| `name` | State name |
| `code` | State code |

### CSV for Access Rights

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_trip_user,trip.user,model_business_trip,base.group_user,1,0,0,0
access_trip_manager,trip.manager,model_business_trip,module.group_manager,1,1,1,1
```

### CSV vs XML

| CSV | XML |
|-----|-----|
| Simpler for bulk data | More flexible |
| Good for flat structures | Good for complex structures |
| Easier to edit | Better for relationships |
| Limited to simple values | Supports eval, search, etc. |

---

## noupdate Attribute

### noupdate="1"

Data in `<data noupdate="1">` is only loaded at installation:

```xml
<odoo>
    <!-- Loaded at install and update -->
    <record id="core_data" model="my.model">
        <field name="name">Core Data</field>
    </record>

    <!-- Loaded only at install -->
    <data noupdate="1">
        <record id="demo_data" model="my.model">
            <field name="name">Demo Data</field>
        </record>
    </data>
</odoo>
```

### When to Use noupdate

| Use Case | noupdate |
|----------|----------|
| Core module data | 0 (default) |
| User-editable data | 1 |
| Default records | 1 |
| Demo data | 1 |
| Configuration | 1 |
| Views, actions, menus | 0 |

### noupdate Examples

```xml
<!-- Core data: always update -->
<record id="ir_cron_send_email" model="ir.cron">
    <field name="name">Send Email</field>
</record>

<!-- User data: never update after install -->
<data noupdate="1">
    <record id="default_warehouse" model="stock.warehouse">
        <field name="name">Default Warehouse</field>
    </record>
</data>

<!-- Demo data: only in demo mode -->
<data noupdate="1" demo="true">
    <record id="demo_partner" model="res.partner">
        <field name="name">Demo Partner</field>
    </record>
</data>
```

---

## Data Processing Patterns (Partner Merge)

Patterns below are extracted from `odoo/addons/base/wizard/base_partner_merge.py` and are useful when building safe data-migration or merge logic in custom modules.

### 1) Normalize Before Grouping

When finding duplicates, normalize values first so grouping is stable:

- `lower(name)` / `lower(email)` for case-insensitive comparisons
- `replace(vat, ' ', '')` to ignore formatting spaces

This avoids false negatives when data is logically equal but formatted differently.

### 2) SQL for Candidate Detection, ORM for Access-Safe Filtering

`base_partner_merge` uses SQL (`min(id), array_agg(id)`) to detect duplicate groups quickly, then re-reads partners with ORM:

```python
self._cr.execute(query)
for min_id, aggr_ids in self._cr.fetchall():
    partners = self.env['res.partner'].search([('id', 'in', aggr_ids)])
```

This pattern combines performance (SQL) with Odoo security/record-rule behavior (ORM).

### 3) Generic FK Rewrite with Savepoint Fallback

For merge operations across many tables:

1. Discover FK relations dynamically
2. Try bulk `UPDATE ... SET fk = dst_id WHERE fk IN src_ids`
3. On unique constraint collision, fallback to deleting conflicting rows
4. Keep each table operation isolated in a savepoint

This prevents one collision from rolling back the whole merge process.

### 4) Reference Field Rewrite (`model,res_id`)

For `reference` fields and models like `ir.attachment`, `mail.followers`, `mail.activity`, `mail.message`, update links from source records to destination records in batch. Always use guarded writes and savepoints.

### 5) Company-Dependent JSONB Data Migration

For company-dependent many2one values stored as JSONB:

- Update per-company values in SQL (`jsonb_each`, `jsonb_object_agg`)
- Merge source JSONB values into destination in deterministic order
- Flush environment after SQL updates

This is safer than partial ORM-only writes when data is stored in JSONB structures.

### 6) Deterministic Destination Selection

The wizard selects destination partner by ordered criteria (`active`, `create_date`) before merge. In custom dedup flows, define and document an explicit winner strategy to keep behavior predictable.

### 7) Defensive Checks Before Merge

Before data merge, validate constraints to avoid corrupt states:

- Do not merge parent with child (`child_of` checks)
- Block conflicting user links
- Enforce consistency checks (for example, same email unless admin)
- Limit merge group size for operational safety

---

## Quick Reference

### record Tag

```xml
<record id="external_id" model="model.name" context="{}">
    <field name="field_name">value</field>
    <field name="field_ref" ref="module.external_id"/>
    <field name="field_eval" eval="True"/>
    <field name="field_search" search="[('name', '=', 'Value')]"/>
    <field name="field_xml" type="xml"><p>content</p></field>
</record>
```

### field Tag Value Types

| Type | Usage |
|------|-------|
| Direct | `<field name="name">Value</field>` |
| eval | `<field name="active" eval="True"/>` |
| ref | `<field name="user" ref="base.user_admin"/>` |
| search | `<field name="country" search="[('code', '=', 'US')]"/>` |
| type="xml" | `<field name="desc" type="xml"><p>HTML</p></field>` |
| type="file" | `<field name="image" type="file" name="path.png"/>` |
| type="base64" | `<field name="data" type="base64" file="file.bin"/>` |
| type="int" | `<field name="count" type="int">42</field>` |

### Relational Commands

| Command | Use |
|---------|-----|
| `(0, 0, {...})` | Create new |
| `(1, id, {...})` | Update |
| `(2, id)` | Remove |
| `(3, id)` | Unlink |
| `(4, id)` | Link |
| `(5,)` | Clear all |
| `(6, 0, [ids])` | Replace set |

### Shortcuts

```xml
<!-- Menu -->
<menuitem id="menu_id" name="Label" parent="parent_id" action="action_id"/>

<!-- Template -->
<template id="template_id" inherit_id="parent_template" active="True"/>

<!-- Asset -->
<asset id="asset_id" name="Name" active="True">
    <bundle>web.assets_frontend</bundle>
    <path>path/to/file</path>
</asset>
```

---

**For more Odoo 18 guides, see [SKILL.md](../SKILL.md)**


---

---
name: odoo-18-decorator
description: "Complete reference for Odoo 18 API decorators (@api.model, @api.depends, @api.constrains, @api.onchange, @api.ondelete, @api.returns) and their proper usage patterns."
globs: "**/models/**/*.py"
topics:
  - api.model (model-level methods)
  - api.depends (computed fields)
  - api.depends_context (context-dependent computed fields)
  - api.constrains (data validation)
  - api.onchange (form UI updates)
  - api.ondelete (delete validation, Odoo 18)
  - api.returns (return type specification)
  - Decorator combinations and decision tree
when_to_use:
  - Writing computed fields
  - Implementing data validation
  - Creating form onchange handlers
  - Preventing record deletion
  - Defining model methods
---

# Odoo 18 Decorator Guide

Complete reference for Odoo 18 API decorators and their proper usage.

## Table of Contents

1. [@api.model](#api-model)
2. [@api.depends](#api-depends)
3. [@api.depends_context](#api-depends_context)
4. [@api.constrains](#api-constrains)
5. [@api.onchange](#api-onchange)
6. [@api.ondelete](#api-ondelete)
7. [@api.returns](#api-returns)

---

## @api.model

**Purpose**: Decorate methods where `self` is a recordset, but the actual records don't matter - only the model class.

```python
from odoo import api, models

class SaleOrder(models.Model):
    _name = 'sale.order'

    @api.model
    def get_default_values(self):
        """Return default values for new orders"""
        return {
            'state': 'draft',
            'date_order': fields.Datetime.now(),
        }

    @api.model
    def create_from_csv(self, csv_data):
        """Class method alternative"""
        for row in csv_data:
            self.create(row)
```

**When to use**:
- Factory methods that create records
- Methods that don't depend on `self` content
- Utility methods for the model

**Common pattern** - Default value callable:
```python
partner_id = fields.Many2one(
    'res.partner',
    default=lambda self: self.env.user.partner_id.id,
)

# Equivalent with @api.model
@api.model
def _default_partner_id(self):
    return self.env.user.partner_id.id
```

---

## @api.depends

**Purpose**: Declare dependencies for computed fields. The method is re-computed when any dependency changes.

```python
from odoo import api, fields, models

class SaleOrder(models.Model):
    _name = 'sale.order'

    amount_untaxed = fields.Float(string='Untaxed Amount')
    tax_amount = fields.Float(string='Tax Amount')
    discount_amount = fields.Float(string='Discount')

    # Basic depends
    amount_total = fields.Float(
        string='Total',
        compute='_compute_amount_total',
        store=True,
    )

    @api.depends('amount_untaxed', 'tax_amount', 'discount_amount')
    def _compute_amount_total(self):
        for order in self:
            order.amount_total = (
                order.amount_untaxed
                + order.tax_amount
                - order.discount_amount
            )
```

**Relational field dependencies**:
```python
@api.depends('partner_id.name', 'partner_id.email')
def _compute_partner_display(self):
    for order in self:
        if order.partner_id:
            order.partner_display = f"{order.partner_id.name} <{order.partner_id.email}>"
        else:
            order.partner_display = ''
```

**One2many traversal**:
```python
@api.depends('line_ids.price_subtotal')
def _compute_amount_total(self):
    for order in self:
        order.amount_total = sum(order.line_ids.mapped('price_subtotal'))
```

**Nested dependencies**:
```python
@api.depends('line_ids.product_id.list_price')
def _compute_max_price(self):
    for order in self:
        prices = order.line_ids.mapped('product_id.list_price')
        order.max_price = max(prices) if prices else 0.0
```

**Important rules**:
1. **Cannot depend on `id`** - use `depends_context('uid')` instead
2. **Must list all dependencies** - missed dependencies cause stale values
3. **Dot notation for relations** - `partner_id.name` not just `partner_id`
4. **No dotted path in @constrains** - only @api.depends supports dotted paths

---

## @api.depends_context

**Purpose**: Make computed field depend on context values. Field recomputed when context changes.

```python
from odoo import api, fields, models

class ProductProduct(models.Model):
    _name = 'product.product'

    # Price depends on pricelist in context
    price = fields.Float(
        string='Price',
        compute='_compute_price',
    )

    @api.depends_context('pricelist')
    def _compute_price(self):
        pricelist_id = self.env.context.get('pricelist')
        if pricelist_id:
            pricelist = self.env['product.pricelist'].browse(pricelist_id)
            for product in self:
                product.price = pricelist.get_product_price(product, 1.0)
        else:
            for product in self:
                product.price = product.list_price
```

**Built-in context keys**:
```python
# Company context
@api.depends_context('company')
def _compute_company_field(self):
    self.company_field = self.env.company.id

# User context
@api.depends_context('uid')
def _compute_user_field(self):
    self.user_field = self.env.user.id

# Language context
@api.depends_context('lang')
def _compute_translated_name(self):
    lang = self.env.context.get('lang', 'en_US')
    self.translated_name = self.name_with_lang(lang)

# Active test context
@api.depends_context('active_test')
def _compute_all_records(self):
    # When active_test=False, include archived records
    domain = [] if self.env.context.get('active_test') else []
    self.all_records = self.search_count(domain)
```

**Custom context keys**:
```python
@api.depends_context('show_prices')
def _compute_display_price(self):
    show_prices = self.env.context.get('show_prices', True)
    for product in self:
        product.display_price = product.price if show_prices else 0.0
```

---

## @api.constrains

**Purpose**: Validate data integrity. Raise `ValidationError` if validation fails.

```python
from odoo import api, models, ValidationError
from odoo.exceptions import ValidationError

class SaleOrder(models.Model):
    _name = 'sale.order'

    @api.constrains('date_order', 'date_validity')
    def _check_dates(self):
        for order in self:
            if order.date_validity and order.date_order > order.date_validity:
                raise ValidationError(
                    "Order date cannot be after validity date."
                )

    @api.constrains('partner_id', 'payment_term_id')
    def _check_payment_term(self):
        for order in self:
            if order.partner_id.property_payment_term_id:
                if order.payment_term_id != order.partner_id.property_payment_term_id:
                    raise ValidationError(
                        "Payment term must match partner's default."
                    )
```

**Validation with relational fields**:
```python
@api.constrains('line_ids')
def _check_lines(self):
    for order in self:
        if not order.line_ids:
            raise ValidationError("Order must have at least one line.")

        # Check for duplicate products
        products = order.line_ids.mapped('product_id')
        if len(products) != len(order.line_ids):
            raise ValidationError("Duplicate products not allowed.")
```

**Limitations**:
1. **No dotted paths** - `partner_id.name` won't work
2. **Must use simple field names** - only direct fields on the model
3. **Only triggers on included fields** - if field not in create/write, constraint won't run

**Workaround for full validation**:
```python
# Override create/write to ensure constraints always run
@api.model_create_multi
def create(self, vals_list):
    records = super().create(vals_list)
    records._check_full_validation()  # Your full constraint method
    return records
```

---

## @api.onchange

**Purpose**: Update form fields dynamically when another field changes.

```python
from odoo import api, models

class SaleOrderLine(models.Model):
    _name = 'sale.order.line'

    product_id = fields.Many2one('product.product', string='Product')
    price_unit = fields.Float(string='Unit Price')
    description = fields.Text(string='Description')

    @api.onchange('product_id')
    def _onchange_product_id(self):
        if self.product_id:
            self.price_unit = self.product_id.list_price
            self.description = self.product_id.description_sale
        else:
            self.price_unit = 0.0
            self.description = ''

    @api.onchange('product_id', 'quantity')
    def _onchange_product_quantity(self):
        if self.product_id and self.quantity:
            self.price_unit = self.product_id.get_price(quantity=self.quantity)
```

**Return warning/notification**:
```python
@api.onchange('discount')
def _onchange_discount(self):
    if self.discount > 50:
        return {
            'warning': {
                'title': "High Discount",
                'message': "Discount over 50% requires approval.",
                'type': 'notification',  # 'dialog' or 'notification'
            }
        }
```

**Update domain**:
```python
@api.onchange('partner_id')
def _onchange_partner_id(self):
    domain = {}
    if self.partner_id:
        domain['shipping_id'] = [
            ('partner_id', '=', self.partner_id.id),
            ('type', '=', 'delivery'),
        ]
    else:
        domain['shipping_id'] = []
    return {'domain': domain}
```

**Limitations**:
1. **No CRUD operations** - cannot call `create()`, `read()`, `write()`, `unlink()`
2. **Only simple field names** - dotted paths not supported
3. **Pseudo-record** - `self` is a single pseudo-record, not saved to DB

**Correct pattern**:
```python
# GOOD: Set field values
@api.onchange('partner_id')
def _onchange_partner_id(self):
    if self.partner_id:
        self.pricelist_id = self.partner_id.property_product_pricelist
        self.payment_term_id = self.partner_id.property_payment_term_id

# BAD: CRUD operations
@api.onchange('partner_id')
def _onchange_partner_id(self):
    self.env['sale.order'].create({})  # ERROR - undefined behavior
```

---

## @api.ondelete

**Purpose**: Validate before allowing record deletion. Supports module uninstallation.

```python
from odoo import api, models
from odoo.exceptions import UserError

class SaleOrder(models.Model):
    _name = 'sale.order'

    @api.ondelete(at_uninstall=False)
    def _unlink_if_not_confirmed(self):
        """Prevent deletion of confirmed orders"""
        if any(order.state == 'confirmed' for order in self):
            raise UserError(
                "Cannot delete confirmed orders. "
                "Cancel them first."
            )

    @api.ondelete(at_uninstall=False)
    def _unlink_except_draft(self):
        """Alternative naming convention"""
        if any(order.state != 'draft' for order in self):
            raise UserError("Only draft orders can be deleted.")
```

**`at_uninstall` parameter**:

| Value | Behavior |
|-------|----------|
| `False` (default) | Check runs during normal use, NOT during module uninstall |
| `True` | Check runs always, including during module uninstall |

**When to use `at_uninstall=True`**:
- System-critical data (default language, main company)
- Data that would break basic functionality if deleted

```python
# Example: Prevent deleting default language
@api.ondelete(at_uninstall=True)
def _unlink_if_default_language(self):
    if self.env.ref('base.lang_en').id in self.ids:
        raise UserError("Cannot delete the default English language.")
```

**Why not override `unlink()`?**:
- Overriding `unlink()` breaks module uninstallation
- `@api.ondelete` is smart about module lifecycle
- Prevents leftover data after uninstall

---

## @api.returns

**Purpose**: Specify the return model of a method for API compatibility.

```python
from odoo import api, models

class SaleOrder(models.Model):
    _name = 'sale.order'

    @api.returns('res.partner')
    def get_partner(self):
        """Returns partner record(s)"""
        return self.mapped('partner_id')

    @api.returns('self')
    def copy(self, default=None):
        """Returns new record(s) of same model"""
        return super().copy(default)
```

**Common usage in Odoo base**:
```python
# Many methods use @api.returns
@api.returns('mail.message', lambda value: value.id)
def message_post(self, ...):
    # Post a message, return the message
    return message
```

---

## Decorator Combination Patterns

### Computed field with search and inverse

```python
full_name = fields.Char(
    string='Full Name',
    compute='_compute_full_name',
    inverse='_inverse_full_name',
    search='_search_full_name',
)

@api.depends('first_name', 'last_name')
def _compute_full_name(self):
    for record in self:
        record.full_name = f"{record.first_name} {record.last_name}"

def _inverse_full_name(self):
    for record in self:
        parts = record.full_name.split(' ', 1)
        record.first_name = parts[0]
        record.last_name = parts[1] if len(parts) > 1 else ''

def _search_full_name(self, operator, value):
    return ['|',
            ('first_name', operator, value),
            ('last_name', operator, value)]
```

### Model method with constrains

```python
@api.model
@api.constrains('code')
def _check_code_format(self):
    """Model method with constraint"""
    for record in self:
        if record.code and not record.code.isalnum():
            raise ValidationError("Code must be alphanumeric.")
```

---

## @api.model_create_multi (Odoo 18)

**Purpose**: Decorate batch create method. The method expects a list of dicts and can be called with either a single dict or a list.

```python
from odoo import api

@api.model_create_multi
def create(self, vals_list):
    """Batch create - receives list of vals, returns recordset"""
    # Add default values
    for vals in vals_list:
        vals.setdefault('state', 'draft')
        vals.setdefault('date', fields.Datetime.now())

    records = super().create(vals_list)

    # Post-processing
    for record in records:
        record._compute_something()

    return records

# Usage:
# record = model.create({'name': 'Test'})      # Single dict
# records = model.create([{'name': 'A'}, ...]) # List of dicts
```

**Note**: If you override `create()` without `@api.model_create_multi`, Odoo 18 will show a deprecation warning.

---

## @api.readonly

**Purpose**: Decorate a method where `self.env.cr` can be a readonly cursor.

```python
@api.readonly
def get_statistics(self):
    """This method can be called with readonly cursor"""
    self.env.cr.execute("SELECT COUNT(*) FROM my_table WHERE ...")
    return self.env.cr.fetchone()[0]
```

Use this decorator for methods that only read from database and don't need write access.

---

## @api.private

**Purpose**: Decorate a method to indicate it cannot be called using RPC.

```python
@api.private
def _internal_method(self):
    """This method cannot be called over RPC"""
    # Only callable internally from Python code
    pass
```

**Best practice**: Prefix business methods that should not be called over RPC with `_` instead of using this decorator.

---

## @api.autovacuum

**Purpose**: Decorate a method to be called by the daily vacuum cron job (model `ir.autovacuum`).

```python
@api.autovacuum
def _gc_expired_records(self):
    """Called daily to clean up old records"""
    expired_date = fields.Datetime.now() - relativedelta(days=30)
    self.search([('create_date', '<', expired_date)]).unlink()
```

**Requirements**:
- Method name must start with `_` (private)
- Use for garbage-collection-like tasks that don't deserve a specific cron job

---

## All API Decorators Reference

| Decorator | Purpose | Odoo Version |
|----------|---------|--------------|
| `@api.model` | Model-level method (self not relevant) | All |
| `@api.depends` | Computed field dependencies | All |
| `@api.depends_context` | Context dependencies | All |
| `@api.constrains` | Data validation | All |
| `@api.onchange` | Form UI updates | All |
| `@api.ondelete` | Delete validation (Odoo 18) | **18+** |
| `@api.returns` | Return type specification | All |
| `@api.model_create_multi` | Batch create | **18+** |
| `@api.readonly` | Readonly cursor | **18+** |
| `@api.private` | Non-RPC callable | **18+** |
| `@api.autovacuum` | Daily vacuum job | **18+** |

---

## Decorator Decision Tree (Updated for Odoo 18)

```
Need to define field behavior?
├── Field value comes from other fields → @api.depends
│   └── Depends on context → also @api.depends_context
│   └── Needs to be searchable → add store=True, search=...
│   └── Can be edited → add inverse=...
├── Validate data integrity → @api.constrains
│   └── Prevent deletion → @api.ondelete
├── Form UI update → @api.onchange
│
Need method behavior?
├── Doesn't depend on self records → @api.model
├── Returns specific model → @api.returns
└── Normal record method → no decorator needed
```


---

---
name: odoo-18-development
description: Complete guide for Odoo 18 module development covering manifest structure, security, reports, wizards, data files, hooks, and exception handling.
globs: "**/*.{py,xml,csv}"
topics:
  - Module structure (folders and files)
  - __manifest__.py (all fields, assets, external dependencies)
  - Security (access rights CSV, record rules, groups)
  - Reports (qweb-pdf, qweb-html, report actions, templates)
  - Wizards & TransientModel (structure, views, multi-step)
  - Data files (records, cron jobs, server actions)
  - Hooks (post_init, pre_init, uninstall)
  - Exception handling (UserError, AccessError, ValidationError, etc.)
  - Complete module examples
when_to_use:
  - Creating new Odoo modules
  - Configuring security and access rights
  - Building reports
  - Creating wizards/transient models
  - Setting up cron jobs and server actions
  - Writing module hooks
  - Handling exceptions properly
---

# Odoo 18 Development Guide

Complete guide for Odoo 18 module development: manifest structure, reports, security, wizards, and advanced patterns.

## Table of Contents

1. [Module Structure](#module-structure)
2. [__manifest__.py](#manifestpy)
3. [Security](#security)
4. [Reports](#reports)
5. [Wizards & Transient Models](#wizards--transient-models)
6. [Data Files](#data-files)
7. [Hooks](#hooks)

---

## Module Structure

### Standard Module Structure

```
my_module/
├── __init__.py                 # Package init
├── __manifest__.py             # Module manifest (REQUIRED)
├── models/
│   ├── __init__.py
│   ├── my_model.py             # Model definitions
│   └── ir_rule.py              # Optional: security rules in Python
├── views/
│   ├── my_model_views.xml      # View definitions
│   ├── my_model_templates.xml  # QWeb templates
│   └── report_templates.xml    # Report templates
├── security/
│   ├── ir.model.access.csv     # Access rights (REQUIRED)
│   └── my_module_security.xml   # Record rules
├── data/
│   ├── my_module_data.xml      # Data records
│   └── ir_cron_data.xml        # Scheduled actions
├── demo/
│   └── my_module_demo.xml      # Demo data
├── report/
│   ├── my_report_views.xml     # Report actions
│   └── my_report_templates.xml # Report QWeb templates
├── wizard/
│   ├── __init__.py
│   ├── my_wizard.py            # TransientModel
│   └── my_wizard_views.xml     # Wizard views
├── static/
│   ├── src/
│   │   ├── js/                 # JavaScript files
│   │   ├── css/                # CSS files
│   │   └── scss/               # SCSS files
│   └── description/
│       └── icon.png            # Module icon
├── controllers/
│   ├── __init__.py
│   └── my_controller.py        # HTTP controllers
├── tests/
│   ├── __init__.py
│   └── test_my_module.py       # Test cases
└── lib/
    └── controller/
        ├── __init__.py
        └── main.py             # Alternative controller location
```

---

## __manifest__.py

### Basic Manifest

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-

{
    'name': 'My Module',
    'version': '18.0.1.0.0',
    'summary': 'Short description of module',
    'description': """
Long Description
==================
Detailed description of what the module does.
    """,
    'category': 'My Category',
    'author': 'Your Name',
    'website': 'https://www.example.com',
    'license': 'LGPL-3',

    # Dependencies
    'depends': [
        'base',
        'product',
    ],

    # Data files
    'data': [
        'security/my_module_security.xml',
        'security/ir.model.access.csv',
        'views/my_module_views.xml',
        'data/my_module_data.xml',
        'report/my_report_views.xml',
    ],

    # Demo data
    'demo': [
        'demo/my_module_demo.xml',
    ],

    # Installation
    'installable': True,
    'application': False,  # True = creates app menu
    'auto_install': False,  # True = auto-install with dependencies

    # Hooks
    'post_init_hook': 'post_init_hook',
    'uninstall_hook': 'uninstall_hook',
}
```

### Manifest Fields Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | str | Yes | Module name |
| `version` | str | Yes | Version (e.g., `18.0.1.0.0`) |
| `summary` | str | No | Short description (one line) |
| `description` | str | No | Long description (can be multi-line) |
| `category` | str | No | Module category |
| `author` | str | No | Author name(s) |
| `website` | str | No | Module URL |
| `license` | str | No | License (default: LGPL-3) |
| `depends` | list | Yes | Required module dependencies |
| `data` | list | No | Data files to load |
| `demo` | list | No | Demo data files |
| `assets` | dict | No | Web assets (CSS/JS) |
| `installable` | bool | Yes | Whether module can be installed |
| `application` | bool | No | Whether it's an app (shows in Apps menu) |
| `auto_install` | bool | No | Auto-install when dependencies installed |
| `post_init_hook` | str | No | Function to call after install |
| `pre_init_hook` | str | No | Function to call before install |
| `uninstall_hook` | str | No | Function to call after uninstall |
| `external_dependencies` | dict | No | Python/ binary dependencies |
| `sequence` | int | No | Installation order in Apps |
| `images` | list | No | Module screenshot URLs |
| `html` | bool | No | Whether description is HTML |

### Assets Declaration (Odoo 18)

```python
'assets': {
    # CSS Variables
    'web._assets_primary_variables': [
        'my_module/static/src/scss/variables.scss',
    ],

    # Backend assets
    'web.assets_backend': [
        'my_module/static/src/js/my_script.js',
        'my_module/static/src/css/my_style.css',
        'my_module/static/src/scss/my_style.scss',
        'my_module/static/src/xml/*.xml',  # QWeb templates
    ],

    # Frontend (website) assets
    'web.assets_frontend': [
        'my_module/static/src/js/frontend.js',
        'my_module/static/src/css/frontend.css',
    ],

    # Report assets
    'web.report_assets_common': [
        'my_module/static/src/css/report.css',
    ],

    # Test assets
    'web.assets_tests': [
        'my_module/static/tests/**/*',
    ],
}
```

### External Dependencies

```python
'external_dependencies': {
    'python': [
        'geopy',
        'openpyxl',
        'python-dateutil',
    ],
    'bin': [
        'pdftk',
        'phantomjs',
    ],
}
```

---

## Security

### Access Rights (ir.model.access.csv)

**Location**: `security/ir.model.access.csv`

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_my_model_user,my.model.user,model_my_model,base.group_user,1,1,1,0
access_my_model_manager,my.model.manager,model_my_model,group_my_module_manager,1,1,1,1
```

**Columns**:
- `id`: Unique XML ID for the access right
- `name`: Human-readable name
- `model_id:id`: Model (reference to `ir.model`)
- `group_id:id`: Group (reference to `res.groups`, empty = all users)
- `perm_read`: Can read (1 = yes, 0 = no)
- `perm_write`: Can write
- `perm_create`: Can create
- `perm_unlink`: Can delete

### Common Access Patterns

```csv
# Full access for managers
access_my_model_manager,my.model.manager,model_my_model,group_my_manager,1,1,1,1

# Read-only for regular users
access_my_model_user,my.model.user,model_my_model,base.group_user,1,0,0,0

# Read and write for regular users
access_my_model_user,my.model.user,model_my_model,base.group_user,1,1,1,0

# No access for portal users
# (Don't declare = no access)

# Portal access (read-only, specific domain)
access_my_model_portal,my.model.portal,model_my_model,base.group_portal,1,0,0,0
```

### Record Rules (ir.rule)

**Location**: `security/my_module_security.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo noupdate="1">

    <!-- Multi-company rule -->
    <record id="my_model_comp_rule" model="ir.rule">
        <field name="name">My Model multi-company</field>
        <field name="model_id" ref="model_my_model"/>
        <field name="domain_force">[('company_id', 'in', company_ids)]</field>
        <field name="global" eval="True"/>
    </record>

    <!-- User can only see their own records -->
    <record id="my_model_personal_rule" model="ir.rule">
        <field name="name">Personal My Records</field>
        <field name="model_id" ref="model_my_model"/>
        <field name="domain_force">[('user_id', '=', user.id)]</field>
        <field name="groups" eval="[(4, ref('base.group_user'))]"/>
    </record>

    <!-- Managers can see all records -->
    <record id="my_model_manager_rule" model="ir.rule">
        <field name="name">My Model: All Records</field>
        <field name="model_id" ref="model_my_model"/>
        <field name="domain_force">[(1, '=', 1)]</field>
        <field name="groups" eval="[(4, ref('group_my_module_manager'))]"/>
        <field name="perm_read" eval="True"/>
        <field name="perm_write" eval="True"/>
        <field name="perm_create" eval="True"/>
        <field name="perm_unlink" eval="True"/>
    </record>

    <!-- Portal access -->
    <record id="my_model_portal_rule" model="ir.rule">
        <field name="name">My Model: Portal Access</field>
        <field name="model_id" ref="model_my_model"/>
        <field name="domain_force">
            [('partner_id', 'in', user.commercial_partner_id.child_ids.ids)]
        </field>
        <field name="groups" eval="[(4, ref('base.group_portal'))]"/>
        <field name="perm_unlink" eval="False"/>
    </record>

</odoo>
```

### ir.rule Fields Reference

| Field | Description |
|-------|-------------|
| `name` | Rule description |
| `model_id` | Model (reference to `ir.model`) |
| `domain_force` | Domain expression for filtering |
| `groups` | Groups rule applies to (empty = all) |
| `perm_read` | Override read permission |
| `perm_write` | Override write permission |
| `perm_create` | Override create permission |
| `perm_unlink` | Override unlink permission |
| `global` | Apply to all users (ignores groups) |

### Rule Domain Variables

| Variable | Description |
|----------|-------------|
| `user` | Current user record |
| `uid` | Current user ID |
| `company_ids` | Allowed companies for current user |
| `company_id` | Current company |
| `context` | Current context |

### Groups Definition

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <!-- Category for module groups -->
    <record id="module_category_my_module" model="ir.module.category">
        <field name="name">My Module</field>
        <field name="description">Helps you manage your records</field>
        <field name="sequence">20</field>
    </record>

    <!-- Manager group -->
    <record id="group_my_module_manager" model="res.groups">
        <field name="name">Manager</field>
        <field name="category_id" ref="module_category_my_module"/>
        <field name="implied_ids" eval="[(4, ref('group_my_module_user'))]"/>
        <field name="comment">User can manage all records.</field>
    </record>

    <!-- User group -->
    <record id="group_my_module_user" model="res.groups">
        <field name="name">User</field>
        <field name="category_id" ref="module_category_my_module"/>
        <field name="comment">User can access own records.</field>
    </record>

</odoo>
```

### Group Inheritance

```xml
<!-- Manager implies user rights -->
<record id="group_my_module_manager" model="res.groups">
    <field name="name">Manager</field>
    <field name="implied_ids" eval="[(4, ref('group_my_module_user'))]"/>
</record>

<!-- Manager also has base group_portal -->
<record id="group_my_module_manager" model="res.groups">
    <field name="implied_ids" eval="[
        (4, ref('group_my_module_user')),
        (4, ref('base.group_portal')),
    ]"/>
</record>
```

---

## Reports

### Report Action (ir.actions.report)

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <record id="action_report_my_model" model="ir.actions.report">
        <field name="name">My Model Report</field>
        <field name="model">my.model</field>
        <field name="report_type">qweb-pdf</field>
        <field name="report_name">my_module.report_my_model</field>
        <field name="report_file">my_model_report</field>
        <field name="print_report_name">'My Model - %s' % (object.name)</field>
        <field name="binding_model_id" ref="model_my_model"/>
        <field name="binding_type">report</field>
    </record>

</odoo>
```

### Report Types

| Type | Description |
|------|-------------|
| `qweb-pdf` | PDF report (most common) |
| `qweb-html` | HTML report (viewed in browser) |
| `qweb-text` | Text report (e.g., for labels) |

### Report with Groups

```xml
<record id="action_report_my_model_confidential" model="ir.actions.report">
    <field name="name">Confidential Report</field>
    <field name="model">my.model</field>
    <field name="report_type">qweb-pdf</field>
    <field name="report_name">my_module.report_confidential</field>
    <field name="groups_id" eval="[(4, ref('group_my_module_manager'))]"/>
    <field name="binding_model_id" ref="model_my_model"/>
    <field name="binding_type">report</field>
</record>
```

### QWeb Report Template

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <!-- Main report template (called for each record) -->
    <template id="report_my_model_document">
        <t t-call="web.external_layout">
            <t t-set="doc" t-value="doc.with_context(lang=doc.partner_id.lang)"/>

            <div class="page">
                <h2 t-field="doc.name"/>
                <table class="table table-sm">
                    <tr>
                        <th>Date</th>
                        <td><span t-field="doc.date"/></td>
                    </tr>
                    <tr>
                        <th>Customer</th>
                        <td>
                            <span t-field="doc.partner_id.name"/>
                            <br/>
                            <span t-field="doc.partner_id.street"/>
                            <span t-field="doc.partner_id.city"/>,
                            <span t-field="doc.partner_id.country_id.code"/>
                        </td>
                    </tr>
                </table>

                <!-- Lines -->
                <t t-if="doc.line_ids">
                    <table class="table table-bordered">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th class="text-right">Quantity</th>
                                <th class="text-right">Price</th>
                                <th class="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr t-foreach="doc.line_ids" t-as="line">
                                <td><span t-field="line.product_id.name"/></td>
                                <td class="text-right"><span t-field="line.quantity"/></td>
                                <td class="text-right"><span t-field="line.price_unit"/></td>
                                <td class="text-right"><span t-field="line.price_total"/></td>
                            </tr>
                        </tbody>
                    </table>
                </t>

                <!-- Totals -->
                <div class="row">
                    <div class="col-6 offset-6">
                        <table class="table table-sm">
                            <tr>
                                <td class="text-right"><strong>Total</strong></td>
                                <td class="text-right"><span t-field="doc.amount_total"/></td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Footer note -->
            <div class="footer_note">
                <t t-if="doc.note">
                    <p t-field="doc.note"/>
                </t>
                <t t-if="doc.conditions">
                    <p t-esc="doc.conditions"/>
                </t>
            </div>
        </t>
    </template>

    <!-- Wrapper template (handles multiple records) -->
    <template id="report_my_model_raw">
        <t t-call="web.html_container">
            <t t-foreach="docs" t-as="doc">
                <t t-call="my_module.report_my_model_document" t-lang="doc.partner_id.lang"/>
            </t>
        </t>
    </template>

    <!-- Main entry point -->
    <template id="report_my_model">
        <t t-call="my_module.report_my_model_raw"/>
    </template>

</odoo>
```

### Report Layouts

Odoo provides several built-in layouts:

| Layout | Usage |
|--------|-------|
| `web.external_layout` | Standard external layout (with header/footer) |
| `web.external_layout_background` | With background styling |
| `web.external_layout_clean` | Minimal layout |
| `web.html_container` | Container without header/footer |
| `web.internal_layout` | Internal layout for backend |

### Dynamic Report Name

```xml
<field name="print_report_name">
    (object.state == 'draft' and 'Draft - %s' % (object.name))
    or 'Confirmed - %s' % (object.name)
</field>
```

---

## Wizards & Transient Models

### TransientModel Structure

```python
from odoo import models, fields, api
from odoo.exceptions import UserError

class MyWizard(models.TransientModel):
    """Wizard for processing selected records"""
    _name = 'my.wizard'
    _description = 'My Wizard'

    # Fields
    date = fields.Date(string='Date', default=fields.Date.context_today, required=True)
    reason = fields.Text(string='Reason')
    user_id = fields.Many2one('res.users', string='User', default=lambda self: self.env.user)

    # Related records (from context)
    record_ids = fields.Many2many(
        'my.model',
        'my_wizard_record_rel',
        'wizard_id',
        'record_id',
        string='Records',
    )

    @api.model
    def default_get(self, fields):
        """Set defaults from context (active_ids)"""
        res = super(MyWizard, self).default_get(fields)

        if 'record_ids' in fields and self.env.context.get('active_model') == 'my.model':
            records = self.env['my.model'].browse(self.env.context.get('active_ids', []))
            res['record_ids'] = [(6, 0, records.ids)]

        return res

    def action_process(self):
        """Process selected records"""
        self.ensure_one()

        # Process records
        for record in self.record_ids:
            record.action_done(self.date, self.reason)

        # Close wizard and show message
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': 'Processed {} records'.format(len(self.record_ids)),
                'type': 'success',
            }
        }

    def action_open_records(self):
        """Open processed records in list view"""
        self.ensure_one()

        return {
            'type': 'ir.actions.act_window',
            'name': 'Processed Records',
            'res_model': 'my.model',
            'domain': [('id', 'in', self.record_ids.ids)],
            'view_mode': 'list,form',
        }
```

### Wizard View

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <!-- Wizard Form View -->
    <record id="view_my_wizard_form" model="ir.ui.view">
        <field name="name">my.wizard.form</field>
        <field name="model">my.wizard</field>
        <field name="arch" type="xml">
            <form string="My Wizard">
                <field name="record_ids" invisible="1"/>
                <group>
                    <group>
                        <field name="date"/>
                    </group>
                    <group>
                        <field name="user_id"/>
                    </group>
                </group>
                <group>
                    <field name="reason" nolabel="1" placeholder="Enter reason..."/>
                </group>
                <footer>
                    <button string="Process" name="action_process" type="object" class="btn-primary"/>
                    <button string="Cancel" class="btn-secondary" special="cancel"/>
                </footer>
            </form>
        </field>
    </record>

    <!-- Wizard Action -->
    <record id="action_my_wizard" model="ir.actions.act_window">
        <field name="name">My Wizard</field>
        <field name="res_model">my.wizard</field>
        <field name="view_mode">form</field>
        <field name="view_id" ref="view_my_wizard_form"/>
        <field name="target">new</field>
    </record>

</odoo>
```

### Wizard Action from Record

```xml
<!-- Add wizard button to model form -->
<record id="view_my_model_form" model="ir.ui.view">
    <field name="name">my.model.form</field>
    <field name="model">my.model</field>
    <field name="inherit_id" ref="my_module.view_my_model_form"/>
    <field name="arch" type="xml">
        <header position="inside">
            <button string="Open Wizard" name="%(action_my_wizard)d"
                    type="action" class="btn-primary"/>
        </header>
    </field>
</record>
```

### TransientModel vs Model

| Feature | TransientModel | Model |
|---------|---------------|-------|
| Data persistence | Auto-deleted (periodic cleanup) | Persistent |
| Use for | Wizards, temporary data | Regular business data |
| Database table | Yes (temporary) | Yes (permanent) |
| Inheritance | `models.TransientModel` | `models.Model` |
| Lifecycle | ~1 day (configurable) | Forever |
| `active_id` | Works | Works |

### Multi-Step Wizard

```python
class MultiStepWizard(models.TransientModel):
    _name = 'multi.step.wizard'

    step = fields.Selection([
        ('step1', 'Step 1'),
        ('step2', 'Step 2'),
        ('step3', 'Step 3'),
    ], default='step1')

    field1 = fields.Char(string='Field 1')
    field2 = fields.Char(string='Field 2')
    field3 = fields.Char(string='Field 3')

    def action_next(self):
        if self.step == 'step1':
            self.write({'step': 'step2'})
        elif self.step == 'step2':
            self.write({'step': 'step3'})
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'multi.step.wizard',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }
```

### Wizard with Context

```python
@api.model
def default_get(self, fields):
    res = super(MyWizard, self).default_get(fields)

    # Get active_ids from context
    active_ids = self.env.context.get('active_ids', [])
    active_model = self.env.context.get('active_model')

    if active_model and active_ids:
        res['record_ids'] = [(6, 0, active_ids)]

    # Get other context values
    res['date'] = self.env.context.get('default_date', fields.Date.today())

    return res
```

---

## Data Files

### Data Records (XML)

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <!-- Simple record -->
    <record id="my_record_1" model="my.model">
        <field name="name">Record 1</field>
        <field name="code">R001</field>
    </record>

    <!-- Record with relation -->
    <record id="my_record_2" model="my.model">
        <field name="name">Record 2</field>
        <field name="category_id" ref="my_category_1"/>
        <field name="user_id" ref="base.user_admin"/>
    </record>

    <!-- noupdate: don't update on module upgrade -->
    <record id="my_record_3" model="my.model" noupdate="1">
        <field name="name">Record 3 (Customizable)</field>
    </record>

</odoo>
```

### Cron Jobs

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <record id="cron_my_model_cleanup" model="ir.cron">
        <field name="name">Clean up old records</field>
        <field name="model_id" ref="model_my_model"/>
        <field name="state">code</field>
        <field name="code">model.cron_cleanup_old_records()</field>
        <field name="interval_number">1</field>
        <field name="interval_type">days</field>
        <field name="numbercall">-1</field>
        <field name="doall" eval="False"/>
        <field name="active" eval="True"/>
    </record>

</odoo>
```

### Server Actions

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <!-- Python code server action -->
    <record id="server_action_my_model" model="ir.actions.server">
        <field name="name">My Server Action</field>
        <field name="model_id" ref="model_my_model"/>
        <field name="state">code</field>
        <field name="code">
records.action_done()
        </field>
    </record>

    <!-- Create new record server action -->
    <record id="server_action_create" model="ir.actions.server">
        <field name="name">Create Record</field>
        <field name="model_id" ref="model_my_model"/>
        <field name="state">object_create</field>
        <field name="use_create">new</field>
        <field name="fields_lines_ids">
            <field eval="[(0, 0, {'field_id': ref('field_my_model_name'), 'value': 'New Record'})]"
                   name="fields_lines_ids"/>
        </field>
    </record>

</odoo>
```

---

## Hooks

### Post-Init Hook

```python
# In __manifest__.py:
# 'post_init_hook': 'post_init_hook',

# In your model file:
def post_init_hook(env):
    """Called after module installation"""
    # Create default records
    env['my.model'].create({
        'name': 'Default Record',
        'code': 'DEFAULT',
    })

    # Run SQL for performance
    env.cr.execute("""
        ALTER TABLE my_model ADD COLUMN IF NOT EXISTS computed_field VARCHAR;
    """)
```

### Uninstall Hook

```python
# In __manifest__.py:
# 'uninstall_hook': 'uninstall_hook',

def uninstall_hook(env):
    """Called before module uninstallation"""
    # Clean up data
    env['my.model'].search([]).unlink()

    # Drop custom columns
    env.cr.execute("""
        ALTER TABLE my_model DROP COLUMN IF EXISTS computed_field;
    """)
```

### Pre-Init Hook

```python
# In __manifest__.py:
# 'pre_init_hook': 'pre_init_hook',

def pre_init_hook(env):
    """Called before module installation"""
    # Prepare database
    env.cr.execute("""
        ALTER TABLE my_model ADD COLUMN IF NOT EXISTS new_field VARCHAR;
    """)
```

---

## Complete Module Example

### __manifest__.py

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-

{
    'name': 'My Module',
    'version': '18.0.1.0.0',
    'summary': 'My Custom Module',
    'description': """
My Module Description
====================
Detailed description.
    """,
    'author': 'Me',
    'category': 'Tools',
    'website': 'https://example.com',
    'license': 'LGPL-3',

    'depends': ['base'],

    'data': [
        'security/my_module_security.xml',
        'security/ir.model.access.csv',
        'views/my_model_views.xml',
        'views/wizard_views.xml',
        'data/my_module_data.xml',
        'report/my_report_views.xml',
    ],

    'demo': [
        'demo/my_module_demo.xml',
    ],

    'installable': True,
    'application': False,

    'assets': {
        'web.assets_backend': [
            'my_module/static/src/js/my_script.js',
        ],
    },
}
```

### models/my_model.py

```python
from odoo import models, fields, api

class MyModel(models.Model):
    _name = 'my.model'
    _description = 'My Model'
    _order = 'date desc'

    name = fields.Char(string='Name', required=True)
    date = fields.Date(string='Date', default=fields.Date.context_today)
    state = fields.Selection([
        ('draft', 'Draft'),
        ('done', 'Done'),
    ], default='draft')

    @api.model
    def action_done(self):
        self.write({'state': 'done'})
```

### security/ir.model.access.csv

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_my_model_user,my.model.user,model_my_model,base.group_user,1,1,1,0
access_my_model_manager,my.model.manager,model_my_model,group_my_module_manager,1,1,1,1
```

### security/my_module_security.xml

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo noupdate="1">
    <record id="group_my_module_manager" model="res.groups">
        <field name="name">Manager</field>
        <field name="implied_ids" eval="[(4, ref('base.group_user'))]"/>
    </record>
</odoo>
```

---

## Common Development Tasks

### Create Custom Action on Model

```xml
<!-- Window action -->
<record id="action_my_model" model="ir.actions.act_window">
    <field name="name">My Models</field>
    <field name="res_model">my.model</field>
    <field name="view_mode">list,form</field>
    <field name="domain">[]</field>
    <field name="context">{'search_default_draft': 1}</field>
    <field name="help" type="html">
        <p class="o_view_nocontent_smiling_face">Create your first record!</p>
    </field>
</record>
```

### Add Context Action

```xml
<!-- Action accessible from smart button -->
<record id="action_my_model_from_partner" model="ir.actions.act_window">
    <field name="name">My Models</field>
    <field name="res_model">my.model</field>
    <field name="view_mode">list,form</field>
    <field name="domain">[('partner_id', '=', active_id)]</field>
    <field name="context">{'default_partner_id': active_id}</field>
</record>

<!-- Bind to partner model -->
<record id="action_my_model_from_partner_value" model="ir.values">
    <field name="name">My Models</field>
    <field name="model_id" ref="model_my_model"/>
    <field name="binding_model_id" ref="model_res_partner"/>
</record>
```

### Add Print Button

```xml
<!-- Report action appears in Print menu -->
<record id="action_report_my_model" model="ir.actions.report">
    <field name="name">My Model Report</field>
    <field name="model">my.model</field>
    <field name="report_type">qweb-pdf</field>
    <field name="report_name">my_module.report_my_model</field>
    <field name="binding_model_id" ref="model_my_model"/>
    <field name="binding_type">report</field>
</record>
```

### Add Server Action Button

```xml
<!-- Server action -->
<record id="server_action_my_model_done" model="ir.actions.server">
    <field name="name">Mark as Done</field>
    <field name="model_id" ref="model_my_model"/>
    <field name="state">code</field>
    <field name="code">records.action_done()</field>
</record>

<!-- Bind to model -->
<record id="server_action_my_model_done_value" model="ir.values">
    <field name="name">Mark as Done</field>
    <field name="model_id" ref="model_my_model"/>
    <field name="binding_model_id" ref="model_my_model"/>
    <field name="action_id" ref="server_action_my_model_done"/>
</record>
```

### Add Context Menu Entry

```xml
<!-- Add to right-click menu -->
<act_window id="action_my_model_context"
    name="My Action"
    res_model="my.model"
    src_model="my.model"
    multi="False"
/>
```

---

## Exception Reference

### Exception Hierarchy (Odoo 18)

```
Exception
├── UserError (Base exception for client errors)
│   ├── AccessDenied (Login/password error - no traceback)
│   ├── AccessError (Access rights error)
│   ├── MissingError (Record not found / deleted)
│   ├── RedirectWarning (Warning with redirect option)
│   └── ValidationError (Constraint violation)
└── CacheMiss (Missing value in cache)
```

### UserError

**Purpose**: Generic error managed by the client. When the user tries to do something that doesn't make sense.

```python
from odoo.exceptions import UserError

def action_confirm(self):
    for order in self:
        if not order.line_ids:
            raise UserError("Cannot confirm an order without lines.")
```

### AccessDenied

**Purpose**: Login/password error. No traceback is shown.

```python
from odoo.exceptions import AccessDenied

def check_password(self, password):
    if not self.env.user._check_password(password):
        raise AccessDenied("Incorrect password")
```

### AccessError

**Purpose**: Access rights error. When user tries to access records they're not allowed to.

```python
from odoo.exceptions import AccessError

def action_delete(self):
    if not self.env.user.has_group('base.group_system'):
        raise AccessError("Only administrators can delete records.")
```

### MissingError

**Purpose**: Record not found or deleted.

```python
from odoo.exceptions import MissingError

def action_update(self):
    record = self.browse(self.id)
    if not record.exists():
        raise MissingError(_("This record has been deleted"))
```

### ValidationError

**Purpose**: Violation of Python constraints.

```python
from odoo.exceptions import ValidationError

@api.constrains('email')
def _check_email(self):
    for record in self:
        if record.email and '@' not in record.email:
            raise ValidationError("Email must contain '@'")
```

### RedirectWarning

**Purpose**: Warning with option to redirect user to another action.

```python
from odoo.exceptions import RedirectWarning

def action_check_config(self):
    if not self.company_id.payment_term_id:
        raise RedirectWarning(
            _("Please configure a default payment term"),
            action=self.env.ref('account.action_payment_term_form').id,
            button_text=_("Configure Payment Terms"),
        )
```

### CacheMiss

**Purpose**: Missing value in cache. Usually raised internally by ORM.

```python
from odoo.exceptions import CacheMiss

try:
    value = self.env.cache.get(record, field)
except CacheMiss:
    # Value not in cache, need to fetch
    value = record._fetch_field(field)
```

### Exception Usage Guidelines

| Exception | When to Use | Behavior |
|-----------|-------------|----------|
| `UserError` | Generic business logic errors | Shows modal to user |
| `AccessDenied` | Wrong login/password | No traceback, login error |
| `AccessError` | Insufficient permissions | Shows error to user |
| `MissingError` | Record deleted/not found | Shows error to user |
| `ValidationError` | Data validation fails | Shows error to user |
| `RedirectWarning` | Need to redirect user | Shows dialog with button |
| `CacheMiss` | Cache lookup (internal) | Handled by ORM |

### Import Statement

```python
from odoo.exceptions import (
    UserError,
    AccessDenied,
    AccessError,
    MissingError,
    ValidationError,
    RedirectWarning,
    CacheMiss,
)
```


---

---
name: odoo-18-field
description: Complete reference for Odoo 18 field types, parameters, and when to use each. Use this guide when defining model fields, choosing field types, or configuring field parameters.
globs: "**/models/**/*.py"
topics:
  - Simple fields (Char, Text, Html, Boolean, Integer, Float, Monetary, Date, Datetime, Binary, Selection, Reference)
  - Relational fields (Many2one, One2many, Many2many)
  - Computed fields (compute, store, search, inverse)
  - Related fields
  - Field parameters (index, default, copy, store, groups, company_dependent, tracking)
when_to_use:
  - Defining new model fields
  - Choosing appropriate field types
  - Configuring computed fields
  - Setting up relational fields
  - Optimizing field parameters
---

# Odoo 18 Field Guide

Complete reference for Odoo 18 field types, parameters, and when to use each.

## Table of Contents

1. [Simple Fields](#simple-fields)
2. [Relational Fields](#relational-fields)
3. [Computed Fields](#computed-fields)
4. [Related Fields](#related-fields)
5. [Field Parameters](#field-parameters)

---

## Simple Fields

### Char - String Field

```python
name = fields.Char(
    string='Name',
    required=True,
    size=100,  # Optional: max length (not enforced by ORM)
    translate=True,  # Enable translation
    default='',  # Default value
)

# Short text (names, codes, etc.)
code = fields.Char(string='Code', index=True)
reference = fields.Char(string='Reference', copy=False)  # Not copied on duplicate
```

**Use for**: Short text values (names, codes, references). Use `size` hint for UI only.

---

### Text - Long Text Field

```python
description = fields.Text(
    string='Description',
    translate=True,
)

# Notes, descriptions, long content
notes = fields.Text(string='Notes')
```

**Use for**: Long-form text content. Not searchable by default in database.

---

### Html - Rich Text Field

```python
content = fields.Html(
    string='Content',
    translate=True,
    sanitize=True,  # Sanitize HTML to prevent XSS
)

# Email body, website content
email_body = fields.Html(string='Email Body')
```

**Use for**: HTML content (email templates, website pages). Automatically sanitized.

---

### Boolean - True/False Field

```python
active = fields.Boolean(
    string='Active',
    default=True,
)

is_company = fields.Boolean(string='Is Company')
```

**Use for**: Yes/No values. Default is `False` if not specified.

---

### Integer - Whole Number Field

```python
quantity = fields.Integer(
    string='Quantity',
    default=1,
)

# Integer with range constraint
priority = fields.Integer(
    string='Priority',
    default=0,
)
```

**Use for**: Whole numbers. Large numbers should use `Float` or `Monetary` instead.

---

### Float - Decimal Number Field

```python
price = fields.Float(
    string='Price',
    digits='Product Price',  # Named precision from decimal.precision
)

# Direct digits specification
weight = fields.Float(
    string='Weight',
    digits=(16, 3),  # (total digits, decimal places)
)
```

**Use for**: Non-monetary decimal values. For currency, use `Monetary` field instead.

### Float Helper Methods (Odoo 18)

```python
# Float precision helpers
from odoo import fields

# Round to precision
rounded = fields.Float.round(
    value,
    precision_rounding=self.product_uom_id.rounding
)

# Check if value is zero at precision
is_zero = fields.Float.is_zero(
    value,
    precision_rounding=self.product_uom_id.rounding
)

# Compare two values at precision
result = fields.Float.compare(
    value1,
    value2,
    precision_rounding=self.product_uom_id.rounding
)
# Returns: negative (v1 < v2), 0 (equal), positive (v1 > v2)
```

**Common Use Cases**:

```python
# Round quantity before display
display_qty = fields.Float.round(
    self.quantity,
    precision_rounding=self.uom_id.rounding
)

# Check if quantity is effectively zero
if fields.Float.is_zero(self.quantity, precision_rounding=0.001):
    raise UserError("Quantity cannot be zero")

# Compare prices at precision
if fields.Float.compare(self.price, self.list_price, precision_rounding=0.01) >= 0:
    # Price is greater than or equal to list price
    pass
```

**Important**: Always use precision_rounding from the unit of measure (product.uom_id.rounding) or currency (res.currency.rounding) when working with Float fields to avoid floating-point comparison issues.

---

### Monetary - Currency Field

```python
amount = fields.Monetary(
    string='Amount',
    currency_field='currency_id',  # many2one to res.currency
)

amount_total = fields.Monetary(
    string='Total',
    currency_field='company_id.currency_id',
)
```

**Use for**: All monetary values. Automatically handles currency formatting and precision.

**Important**: Always specify `currency_field` pointing to a `res.currency` many2one.

---

### Date - Date Field

```python
date = fields.Date(
    string='Date',
    default=fields.Date.context_today,
    copy=False,
)

# Date computed field
date_deadline = fields.Date(
    string='Deadline',
    compute='_compute_date_deadline',
    store=True,
)
```

**Use for**: Dates without time. Stored as date in database (no timezone issues).

---

### Datetime - Timestamp Field

```python
datetime = fields.Datetime(
    string='DateTime',
    default=fields.Datetime.now,
    copy=False,
)

# Common pattern for tracking
create_date = fields.Datetime(string='Created on', readonly=True)
write_date = fields.Datetime(string='Last Updated on', readonly=True)
```

**Use for**: Dates with time. Stored as UTC, displayed in user timezone.

### Date/Datetime Helper Methods (Odoo 18)

```python
# Date helper methods
from odoo import fields

# Get start/end of period
start_of_month = fields.Date.start_of(fields.Date.today(), 'month')
end_of_quarter = fields.Date.end_of(fields.Date.today(), 'quarter')

# Add/subtract time periods
next_month = fields.Date.add(fields.Date.today(), months=1)
last_week = fields.Date.subtract(fields.Date.today(), weeks=2)

# Supported granularities: 'year', 'quarter', 'month', 'week', 'day', 'hour'

# Convert to/from string
date_obj = fields.Date.to_date('2024-01-15')  # String to date
date_str = fields.Date.to_string(fields.Date.today())  # Date to string

# Context-aware today
today_tz = fields.Date.context_today(record)  # Today in record's timezone

# Datetime helper methods
now_utc = fields.Datetime.now()  # Current UTC datetime
today_midnight = fields.Datetime.today()  # Today at midnight (00:00:00)

# Add/subtract datetime
next_hour = fields.Datetime.add(fields.Datetime.now(), hours=1)
yesterday = fields.Datetime.subtract(fields.Datetime.now(), days=1)

# Convert to/from string
datetime_obj = fields.Datetime.to_datetime('2024-01-15 14:30:00')
datetime_str = fields.Datetime.to_string(fields.Datetime.now())

# Context-aware timestamp
timestamp_tz = fields.Datetime.context_timestamp(record, datetime_obj)
```

**Common Use Cases**:

```python
# Get start of current month for reports
start_date = fields.Date.start_of(fields.Date.today(), 'month')
end_date = fields.Date.end_of(fields.Date.today(), 'month')

# Add 30 days to current date
due_date = fields.Date.add(fields.Date.today(), days=30)

# Get end of current quarter
quarter_end = fields.Date.end_of(fields.Date.today(), 'quarter')
```

---

### Binary - File/Attachment Field

```python
file = fields.Binary(
    string='File',
    attachment=True,  # Show in attachments chatter
)

image = fields.Binary(string='Image')
image_1920 = fields.Binary(string='Image 1920', max_width=1920, max_height=1920)
```

**Use for**: File attachments and images. Use `attachment=True` for chatter integration.

**Note**: With `bin_size` context, returns size in bytes instead of content.

---

### Image - Image Field with Resize (Odoo 18)

```python
# Image field with automatic resize
image = fields.Image(
    string='Image',
    max_width=1920,      # Resize if wider than 1920px
    max_height=1080,     # Resize if taller than 1080px
    verify_resolution=True,  # Check max resolution (50MP default)
)

# Product image
image_1920 = fields.Image(
    string='Product Image',
    max_width=1920,
    max_height=1920,
)

# Without size limit
image_large = fields.Image(
    string='Large Image',
    max_width=0,  # No limit
    max_height=0,  # No limit
    verify_resolution=False,
)
```

**Important**:
- `Image` extends `Binary` field
- Automatically resizes images if they exceed `max_width`/`max_height` while maintaining aspect ratio
- `verify_resolution=True` checks against maximum image resolution (~50MP default)
- If `max_width` or `max_height` is 0 and `verify_resolution` is False, no verification is performed

---

### Many2oneReference - Dynamic Typed Reference (Odoo 18)

```python
# Many2oneReference - model stored in separate field
ref_id = fields.Many2oneReference(
    string='Reference',
    model_field='model_name',  # Char field containing model name
)

# Example usage
class MyModel(models.Model):
    _name = 'my.model'

    model_name = fields.Char(string='Model Name')  # Stores model name
    ref_id = fields.Many2oneReference(
        string='Reference',
        model_field='model_name'
    )

# Usage: ref_id can point to any model, model_name stores which model
# Stored as integer ID in database (more efficient than Reference string)
```

**Important**:
- `Many2oneReference` stores value as integer ID (unlike `Reference` which stores "model,id" string)
- Requires a separate Char field to store the model name
- More efficient than `Reference` for database queries and joins
- Use when you need dynamic references to multiple possible models

---

### Selection - Dropdown Field

```python
# Simple selection
state = fields.Selection([
    ('draft', 'Draft'),
    ('confirmed', 'Confirmed'),
    ('done', 'Done'),
], string='State', default='draft')

# Selection from model method
state = fields.Selection(
    '_get_selection_states',
    string='State'
)

@api.model
def _get_selection_states(self):
    return [
        ('draft', 'Draft'),
        ('confirmed', 'Confirmed'),
    ]
```

**Use for**: Fixed set of options. Values are stored in database, must not change keys.

---

### Reference - Dynamic Reference

```python
ref_id = fields.Reference(
    string='Reference',
    selection='_models_get',
)

@api.model
def _models_get(self):
    models = self.env['ir.model'].search([])
    return [(model.model, model.name) for model in models]
```

**Use for**: References to multiple possible models. Stored as `model,id` string.

---

## Relational Fields

### Many2one - Many-to-One

```python
partner_id = fields.Many2one(
    'res.partner',
    string='Partner',
    required=True,
    ondelete='cascade',  # 'set null', 'restrict', 'cascade'
    domain=[('customer_rank', '>', 0)],
    context={'default_customer_rank': 1},
    default=lambda self: self.env.user.partner_id.id,
)

# Optional many2one
company_id = fields.Many2one(
    'res.company',
    string='Company',
    ondelete='set null',
)

# With delegate (inherits)
partner_id = fields.Many2one(
    'res.partner',
    string='Partner',
    required=True,
    ondelete='cascade',
    delegate=True,  # Inherits all fields from partner
)
```

**Parameters**:
- `comodel_name` - Target model (positional argument)
- `ondelete` - What to do when referenced record is deleted: `'set null'`, `'restrict'`, `'cascade'`
- `domain` - Domain for searchable dropdown
- `context` - Context passed to action
- `default` - Default value (can be callable)
- `delegate` - Enable inheritance (delegate pattern)

---

### One2many - One-to-Many

```python
# Inverse of Many2one - MUST specify inverse_name
line_ids = fields.One2many(
    'sale.order.line',
    'order_id',
    string='Order Lines',
)

# One2many with computed domain (Odoo 18)
active_line_ids = fields.One2many(
    'sale.order.line',
    'order_id',
    string='Active Lines',
    domain=[('state', '!=', 'cancel')],
)
```

**Parameters**:
- `comodel_name` - Target model (positional argument)
- `inverse_name` - Many2one field on target model that points back (REQUIRED)
- `domain` - Domain filter for displayed records
- `copy` - Copy lines on duplicate (default `True`)

**Important**: Always define the corresponding `Many2one` on the child model.

---

### Many2many - Many-to-Many

```python
tag_ids = fields.Many2many(
    'sale.order.tag',
    'sale_order_tag_rel',
    'order_id',
    'tag_id',
    string='Tags',
)

# Without relation table name (auto-generated)
category_ids = fields.Many2many(
    'res.partner.category',
    string='Categories',
)

# Many2many with domain
allowed_category_ids = fields.Many2many(
    'res.partner.category',
    string='Allowed Categories',
    domain=[('parent_id', '=', False)],
)
```

**Parameters**:
- `comodel_name` - Target model (positional argument)
- `relation` - Relation table name (optional, auto-generated if omitted)
- `column1` - Column name for this model's ID in relation table
- `column2` - Column name for target model's ID in relation table
- `domain` - Domain for displayed records

---

## Computed Fields

### Basic Compute Field

```python
amount_total = fields.Float(
    string='Total',
    compute='_compute_amount_total',
)

@api.depends('amount_untaxed', 'tax_amount', 'discount_amount')
def _compute_amount_total(self):
    for record in self:
        record.amount_total = (
            record.amount_untaxed
            + record.tax_amount
            - record.discount_amount
        )
```

### Stored Compute Field

```python
# Stored - can be searched, used in domains
amount_total = fields.Float(
    string='Total',
    compute='_compute_amount_total',
    store=True,
)

@api.depends('line_ids.price_subtotal')
def _compute_amount_total(self):
    for order in self:
        order.amount_total = sum(order.line_ids.mapped('price_subtotal'))
```

### Compute with Search

```python
# Allow searching on computed field
display_name = fields.Char(
    string='Display Name',
    compute='_compute_display_name',
    search='_search_display_name',
)

@api.depends('name', 'ref')
def _compute_display_name(self):
    for record in self:
        record.display_name = f"[{record.ref}] {record.name}"

def _search_display_name(self, operator, value):
    return ['|', ('name', operator, value), ('ref', operator, value)]
```

### Compute with Inverse

```python
# Allow writing to computed field (bidirectional)
name = fields.Char(
    string='Name',
    compute='_compute_name',
    inverse='_inverse_name',
)

@api.depends('first_name', 'last_name')
def _compute_name(self):
    for record in self:
        record.name = f"{record.first_name} {record.last_name}"

def _inverse_name(self):
    for record in self:
        parts = record.name.split(' ', 1)
        record.first_name = parts[0]
        record.last_name = parts[1] if len(parts) > 1 else ''
```

---

## Related Fields

### Basic Related Field

```python
partner_name = fields.Char(
    string='Partner Name',
    related='partner_id.name',
    readonly=True,
)

# Store related field (for search/group by)
partner_country_id = fields.Many2one(
    'res.country',
    string='Country',
    related='partner_id.country_id',
    store=True,
)
```

### Multi-Level Related

```python
partner_country_code = fields.Char(
    string='Country Code',
    related='partner_id.country_id.code',
    readonly=True,
)
```

### Related with Company Dependency

```python
company_currency_id = fields.Many2one(
    'res.currency',
    related='company_id.currency_id',
    string='Company Currency',
    readonly=True,
)
```

---

## Field Parameters

### Common Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `string` | str | Field label (display name) |
| `required` | bool | Field must have value (validation) |
| `readonly` | bool | Field is read-only in UI (not enforced in code) |
| `index` | bool/str | Create database index (`'btree'`, `'btree_not_null'`, `'trigram'`) |
| `default` | value/callable | Default value |
| `copy` | bool | Copy field on duplicate (default `True`, `False` for o2many) |
| `store` | bool | Store in database (default `True`, `False` for computed) |
| `groups` | str | Comma-separated group XML IDs for access control |
| `company_dependent` | bool | Value varies by company (stored as jsonb) |
| `help` | str | Tooltip text |
| `translate` | bool | Enable translation |
| `tracking` | bool/int | Track changes in chatter (`1`=always, `2`=only if set) |

### Index Types

```python
# Standard btree index (good for many2one, equality)
code = fields.Char(string='Code', index=True)
code = fields.Char(string='Code', index='btree')

# Btree not null (most values are NULL)
category_id = fields.Many2one('category', index='btree_not_null')

# Trigram index (full-text search)
name = fields.Char(string='Name', index='trigram')
```

### Default Value Patterns

```python
# Static default
active = fields.Boolean(default=True)

# Callable default (evaluated per record)
date = fields.Date(default=fields.Date.context_today)
datetime = fields.Datetime(default=fields.Datetime.now)

# Lambda default (can access self/env)
user_id = fields.Many2one(
    'res.users',
    string='User',
    default=lambda self: self.env.user,
)

# Company-dependent default
company_id = fields.Many2one(
    'res.company',
    string='Company',
    default=lambda self: self.env.company,
)
```

### Company Dependent Fields

```python
# Value varies by company (property field)
payment_term_id = fields.Many2one(
    'account.payment.term',
    string='Payment Terms',
    company_dependent=True,
)

# Access for specific company
record.with_context(company_id=1).payment_term_id
```

---

## Odoo 18 Field Parameters

### aggregator (Odoo 18)

**Replaces**: `group_operator` (deprecated since Odoo 18)

```python
# Odoo 18+ - use aggregator
amount = fields.Float(
    string='Amount',
    aggregator='sum',  # NEW in Odoo 18
)

# Supported aggregators (from READ_GROUP_AGGREGATE):
# - sum, avg, max, min
# - bool_and, bool_or
# - array_agg, recordset
# - count, count_distinct
```

### precompute (Odoo 18)

Compute field before record insertion.

```python
sequence = fields.Integer(
    string='Sequence',
    compute='_compute_sequence',
    precompute=True,  # Compute at form init
    store=False,
)

@api.depends('date_order')
def _compute_sequence(self):
    for order in self:
        if order.date_order:
            order.sequence = self.env['ir.sequence'].next_by_code(...)
```

**Warning**: `precompute=True` can be counterproductive for:
- Statistics fields (count, sum over search)
- Fields that require database reads
- One-off record creation (not batch)

### recursive (Odoo 18)

For fields with recursive dependencies like `parent_id.X`.

```python
# Field has dependency like parent_id.X
total = fields.Float(
    string='Total',
    compute='_compute_total',
    store=True,
    recursive=True,  # Declare recursive dependency explicitly
)
```

### compute_sudo (Odoo 18)

Whether field should be recomputed as superuser.

```python
# Default: True for stored fields, False for non-stored
amount = fields.Float(
    string='Amount',
    compute='_compute_amount',
    store=True,
    compute_sudo=True,  # Compute as admin (default for stored)
)

price = fields.Float(
    string='Price',
    compute='_compute_price',
    compute_sudo=False,  # Compute as current user (default for non-stored)
)
```

### group_operator (Deprecated)

**Deprecated in Odoo 18**: Use `aggregator` instead.

```python
# OLD (deprecated)
amount = fields.Float(group_operator='sum')

# NEW (Odoo 18+)
amount = fields.Float(aggregator='sum')
```

---

## Field Type Selection Guide

| Requirement | Use Field |
|-------------|-----------|
| Short text (name, code) | `Char` |
| Long text (description) | `Text` |
| HTML content (email, web) | `Html` |
| Yes/No | `Boolean` |
| Whole number | `Integer` |
| Decimal (non-currency) | `Float` |
| Money | `Monetary` |
| Date only | `Date` |
| Date + time | `Datetime` |
| File/Attachment | `Binary` |
| Dropdown options | `Selection` |
| Many-to-one relation | `Many2one` |
| One-to-many relation | `One2many` |
| Many-to-many relation | `Many2many` |
| Derived from other fields | `compute` |
| Field from related record | `related` |
| Multi-company value | `company_dependent=True` |


---

---
name: odoo-18-manifest
description: Complete reference for Odoo 18 module manifest (__manifest__.py) covering all fields, dependencies, assets, external dependencies, hooks, auto_install, and module structure.
globs: "**/__manifest__.py"
topics:
  - All __manifest__.py fields
  - Module dependencies and loading order
  - Assets bundles (web.assets_frontend, etc.)
  - External dependencies (python, bin)
  - Hooks (pre_init, post_init, uninstall)
  - auto_install behavior
  - Module categories
  - License types
when_to_use:
  - Creating new Odoo modules
  - Configuring module dependencies
  - Setting up assets (JS, CSS, SCSS)
  - Declaring external Python/binary dependencies
  - Using module hooks for initialization
---

# Odoo 18 Module Manifest Guide

Complete reference for Odoo 18 `__manifest__.py`: all fields, dependencies, assets, hooks, and configuration.

## Table of Contents

1. [Manifest Basics](#manifest-basics)
2. [Core Fields](#core-fields)
3. [Dependencies](#dependencies)
4. [Data Loading](#data-loading)
5. [Assets](#assets)
6. [External Dependencies](#external-dependencies)
7. [Hooks](#hooks)
8. [Complete Example](#complete-example)

---

## Manifest Basics

### File Name and Location

```
my_module/
├── __init__.py
├── __manifest__.py  # <-- Manifest file
├── models/
├── views/
└── ...
```

### File Name

- Odoo 13+: `__manifest__.py`
- Odoo 12 and older: `__openerp__.py` (deprecated)

### Basic Structure

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-

{
    'name': 'My Module',
    'version': '1.0.0',
    'category': 'Tools',
    'summary': 'Short description',
    'description': """
        Long Description
    """,
    'author': 'Author Name',
    'website': 'https://www.example.com',
    'license': 'LGPL-3',
    'depends': ['base'],
    'data': [
        'views/my_views.xml',
    ],
    'demo': [
        'demo/my_demo.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
```

---

## Core Fields

### Required Fields

Only `name` is truly required, but `version` and `depends` should always be specified.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | str | - | Human-readable module name (required) |
| `version` | str | - | Module version (should use semantic versioning) |
| `description` | str | - | Extended description in RST |
| `author` | str | - | Module author name |
| `website` | str | - | Author website URL |
| `license` | str | LGPL-3 | Distribution license |
| `category` | str | Uncategorized | Module category |
| `depends` | list(str) | - | Required modules |
| `data` | list(str) | - | Data files to load |
| `installable` | bool | True | Whether module can be installed |

### name (Required)

```python
'name': 'My Module',
```

The display name shown in Apps menu.

### version

```python
'version': '1.0.0',
```

Should follow [semantic versioning](https://semver.org):
- `MAJOR.MINOR.PATCH`
- Increment: MAJOR for incompatible changes, MINOR for backwards-compatible features, PATCH for bug fixes

```python
# Examples
'version': '1.0.0',      # First release
'version': '1.1.0',      # Added feature
'version': '1.1.1',      # Bug fix
'version': '2.0.0',      # Breaking changes
```

### description

```python
'description': """
This module provides functionality for managing business trips.
Features include:
- Trip creation and management
- Expense tracking
- Email notifications
""",
```

Supports reStructuredText formatting.

### author

```python
'author': 'Author Name',
```

Can be person name, company name, or both:

```python
'author': 'Odoo SA',
'author': 'John Doe',
'author': 'My Company, Inc.',
```

### website

```python
'website': 'https://www.odoo.com',
```

### license

```python
'license': 'LGPL-3',
```

Valid values:

| License | Description |
|---------|-------------|
| `LGPL-3` | GNU Lesser General Public License v3 (default) |
| `GPL-2` | GNU General Public License v2 |
| `GPL-3` | GNU General Public License v3 |
| `GPL-2 or any later version` | GPL v2 or later |
| `GPL-3 or any later version` | GPL v3 or later |
| `AGPL-3` | GNU Affero General Public License v3 |
| `OEEL-1` | Odoo Enterprise Edition License v1.0 |
| `OPL-1` | Odoo Proprietary License v1.0 |
| `Other OSI approved licence` | Other OSI-approved license |
| `Other proprietary` | Proprietary license |

### category

```python
'category': 'Tools',
```

Common categories (use existing when possible):

| Category |
|----------|
| Accounting |
| Discussion |
| Document Management |
| eCommerce |
| Human Resources |
| Marketing |
| Manufacturing |
| Point of Sale |
| Project |
| Purchases |
| Sales |
| Tools |
| Warehouse |
| Website |

Custom categories with hierarchy:

```python
'category': 'Tools/Trip Management',
```

Creates `Tools` (parent) → `Trip Management` (child).

### summary

```python
'summary': 'Short description for module list',
```

Brief description shown in module list (one line).

---

## Dependencies

### depends

```python
'depends': ['base', 'mail', 'web'],
```

Modules that must be loaded before this one.

#### Loading Order

1. All dependencies are installed/upgraded before this module
2. Dependencies are loaded before this module

```python
# base always exists but still specify
'depends': ['base'],

# Multiple dependencies
'depends': ['mail', 'web', 'website'],

# With custom modules
'depends': ['base', 'my_other_module'],
```

#### Circular Dependencies

**Avoid circular dependencies!** They cause installation failures.

```
Bad:
Module A depends on B
Module B depends on A
```

### auto_install

```python
'auto_install': True,
```

Automatically install if all dependencies are installed.

```python
# Simple auto_install
'auto_install': True,

# Auto-install if specific subset is installed
'auto_install': ['sale', 'crm'],
```

Common for "link modules":

```python
# sale_crm links sale and crm
'depends': ['sale', 'crm'],
'auto_install': True,
```

---

## Data Loading

### data

```python
'data': [
    'views/my_views.xml',
    'security/my_security.xml',
    'report/my_reports.xml',
],
```

Files loaded at **both** installation and update.

### demo

```python
'demo': [
    'demo/my_demo.xml',
],
```

Files loaded **only in demo mode**.

```python
# Demo mode vs regular mode
'data': [
    'data/core_data.xml',   # Always loaded
],
'demo': [
    'demo/demo_data.xml',    # Only in demo mode
],
```

### data vs demo

| Type | When Loaded |
|------|-------------|
| `data` | Install and update |
| `demo` | Only in demo mode (install only) |

### File Paths

Paths are relative to module root:

```python
'data': [
    'views/views.xml',           # OK: relative path
    '/views/views.xml',          # BAD: absolute path
    '../other_module/file.xml',  # BAD: other module
],
```

---

## Assets

### assets

```python
'assets': {
    'web.assets_frontend': [
        'my_module/static/src/js/main.js',
        'my_module/static/src/scss/style.scss',
    ],
    'web.assets_backend': [
        'my_module/static/src/js/backend.js',
    ],
    'web.assets_tests': [
        'my_module/static/tests/js/test.js',
    ],
},
```

### Asset Bundles

| Bundle | Description |
|--------|-------------|
| `web.assets_frontend` | Website frontend assets |
| `web.assets_backend` | Backend interface assets |
| `web.assets_tests` | Test assets |
| `web.assets_common` | Common assets (rarely used) |

### Asset Paths

```python
'assets': {
    'web.assets_frontend': [
        # JavaScript files
        'my_module/static/src/js/module.js',
        'my_module/static/src/xml/component.xml',  # OWL templates

        # CSS/SCSS files
        'my_module/static/src/scss/main.scss',
        'my_module/static/src/css/custom.css',

        # External files (rare)
        'https://cdn.example.com/library.js',
    ],
}
```

### Module-specific Assets

```python
'assets': {
    'web.assets_frontend': [
        'my_module/static/src/js/*.js',
        'my_module.static.src.scss.*',  # Note: different format
    ],
    'my_module.assets': [
        'my_module/static/lib/library.js',
    ],
}
```

---

## External Dependencies

### external_dependencies

```python
'external_dependencies': {
    'python': [
        'requests',
        'python-dateutil',
        'openpyxl',
    ],
    'bin': [
        'wkhtmltopdf',
        'pdftk',
    ],
}
```

### Python Dependencies

```python
'external_dependencies': {
    'python': [
        'requests',           # pip install requests
        'gevent',             # pip install gevent
        'Pillow',             # pip install Pillow
    ],
}
```

Module installation will **fail** if Python package not available.

### Binary Dependencies

```python
'external_dependencies': {
    'bin': [
        'wkhtmltopdf',        # Must be in PATH
        'ffmpeg',             # Must be in PATH
        'curl',               # Must be in PATH
    ],
}
```

Module installation will **fail** if binary not found in PATH.

---

## Hooks

### Hook Functions

```python
'pre_init_hook': 'module_pre_init',
'post_init_hook': 'module_post_init',
'uninstall_hook': 'module_uninstall',
```

### pre_init_hook

```python
'pre_init_hook': 'pre_init_function',
```

Executed **before** module installation.

```python
# __init__.py
def pre_init_function(env):
    """Create tables before module install"""
    env.cr.execute("""
        CREATE TABLE IF NOT EXISTS my_custom_table (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100)
        )
    """)
```

### post_init_hook

```python
'post_init_hook': 'post_init_function',
```

Executed **after** module installation.

```python
# __init__.py
def post_init_function(env):
    """Set up data after module install"""
    # Create default records
    env['my.model'].create({
        'name': 'Default Record',
    })

    # Configure settings
    config = env['ir.config_parameter'].sudo()
    config.set_param('my_module.key', 'value')
```

### uninstall_hook

```python
'uninstall_hook': 'uninstall_function',
```

Executed **after** module uninstallation.

```python
# __init__.py
def uninstall_function(env):
    """Clean up after module uninstall"""
    # Drop custom tables
    env.cr.execute("DROP TABLE IF EXISTS my_custom_table")

    # Clean up settings
    env['ir.config_parameter'].sudo().search([
        ('key', 'like', 'my_module.%')
    ]).unlink()
```

### Hook Signatures

All hooks receive `env` (Environment):

```python
def my_hook(env):
    # env: Odoo Environment
    # Use: env['model'], env.cr, etc.
    pass
```

---

## Other Fields

### application

```python
'application': True,
```

Whether module is a full application (vs technical module).

```python
# Technical module (default)
'application': False,  # or omit

# Full application
'application': True,
```

Applications appear in Apps menu separately.

### installable

```python
'installable': True,
```

Whether users can install from UI.

```python
# Default: can be installed
'installable': True,

# Prevent installation (for development/unstable modules)
'installable': False,
```

### maintainer

```python
'maintainer': 'Maintainer Name',
```

Person/entity maintaining the module (defaults to `author` if not set).

### series

```python
'series': '18.0',
```

Odoo version series (deprecated, use directory structure instead).

---

## Complete Example

### Full Manifest

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-

{
    # == Identification ==
    'name': 'Business Trip Management',
    'version': '1.0.0',
    'category': 'Tools/Trip Management',
    'summary': 'Manage business trips and expenses',
    'description': """
Business Trip Management
=======================

This module allows you to:
* Create and manage business trips
* Track expenses related to trips
* Send email notifications to participants
* Generate trip reports

Features
---------
* Trip planning and management
* Expense tracking with receipts
* Email aliases for expense submission
* Activity management for trip tasks
    """,
    'author': 'My Company',
    'website': 'https://www.example.com',
    'license': 'LGPL-3',
    'maintainer': 'John Doe <john@example.com>',

    # == Dependencies ==
    'depends': [
        'base',
        'mail',
        'web',
        'web_kanban',
        'portal',
    ],
    'auto_install': False,

    # == Data ==
    'data': [
        # Security
        'security/business_trip_security.xml',
        'security/ir.model.access.csv',

        # Views
        'views/business_trip_views.xml',
        'views/expense_views.xml',
        'views/business_trip_templates.xml',

        # Data
        'data/business_trip_data.xml',
        'data/ir_cron_data.xml',

        # Reports
        'report/trip_report_views.xml',
        'report/trip_report_templates.xml',

        # Wizards
        'wizard/trip_wizard_views.xml',

        # Demo (only in demo mode)
        'demo/business_trip_demo.xml',
    ],

    # == Assets ==
    'assets': {
        'web.assets_backend': [
            'business_trip/static/src/js/trip_form.js',
            'business_trip/static/src/xml/trip_qweb.xml',
            'business_trip/static/src/scss/trip.scss',
        ],
        'web.assets_frontend': [
            'business_trip/static/src/js/portal_trip.js',
        ],
    },

    # == External Dependencies ==
    'external_dependencies': {
        'python': [
            'requests',      # For external API calls
            'python-dateutil',
        ],
        'bin': [
            'wkhtmltopdf',   # For reports
        ],
    },

    # == Hooks ==
    'pre_init_hook': 'pre_init_business_trip',
    'post_init_hook': 'post_init_business_trip',
    'uninstall_hook': 'uninstall_business_trip',

    # == Configuration ==
    'application': False,
    'installable': True,

    # == Version Info ==
    'post_init_hook': 'post_init_business_trip',
}
```

### With Hook Implementation

```python
# __init__.py
# -*- coding: utf-8 -*-

def pre_init_business_trip(env):
    """Create custom table before install"""
    env.cr.execute("""
        CREATE TABLE IF NOT EXISTS business_trip_log (
            id SERIAL PRIMARY KEY,
            trip_id INTEGER NOT NULL,
            message TEXT,
            create_date TIMESTAMP DEFAULT NOW()
        )
    """)

def post_init_business_trip(env):
    """Set up default configuration"""
    # Create default trip type
    env['business.trip.type'].create({
        'name': 'General',
        'code': 'GEN',
    })

    # Configure settings
    config = env['ir.config_parameter'].sudo()
    config.set_param('business_trip.auto_confirm', False)

def uninstall_business_trip(env):
    """Clean up on uninstall"""
    # Drop custom table
    env.cr.execute("DROP TABLE IF EXISTS business_trip_log")

    # Clean up parameters
    env['ir.config_parameter'].sudo().search([
        ('key', 'like', 'business_trip.%')
    ]).unlink()
```

---

## Quick Reference

### Minimal Manifest

```python
{
    'name': 'My Module',
    'version': '1.0',
    'depends': ['base'],
    'installable': True,
}
```

### Common Patterns

#### Web Module

```python
{
    'name': 'My Website Module',
    'depends': ['website'],
    'data': [
        'views/templates.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'my_module/static/src/js/main.js',
            'my_module/static/src/scss/style.scss',
        ],
    },
}
```

#### Module with Mail

```python
{
    'name': 'My Mail Module',
    'depends': ['mail'],
    'data': [
        'views/views.xml',
        'data/mail_template_data.xml',
    ],
}
```

#### Portal Module

```python
{
    'name': 'My Portal Module',
    'depends': ['portal', 'web'],
    'data': [
        'views/portal_templates.xml',
    ],
}
```

#### With External Libraries

```python
{
    'name': 'My API Module',
    'external_dependencies': {
        'python': ['requests', 'oauthlib'],
        'bin': ['curl'],
    },
}
```

---

**For more Odoo 18 guides, see [SKILL.md](../SKILL.md)**


---

---
name: odoo-18-migration
description: Comprehensive guide for upgrading modules and data to Odoo 18,
  including migration scripts, upgrade hooks, deprecations, and best practices.
globs: "**/migrations/**/*.py"
topics:
  - Migration script structure (pre/post/end)
  - Module upgrade hooks (pre_init, post_init, uninstall)
  - Deprecations and replacements
  - Data migration with SQL and ORM
  - Version checks and upgrade tooling
when_to_use:
  - Creating or reviewing migration scripts
  - Upgrading modules across major versions
  - Handling data migration and cleanup
  - Dealing with deprecations
---

# Odoo 18 Migration Guide

Comprehensive guide for migrating modules and data to Odoo 18, covering migration scripts, upgrade hooks, deprecations, and best practices.

## Table of Contents

1. [Migration Script Structure](#migration-script-structure)
2. [Module Upgrade Hooks](#module-upgrade-hooks)
3. [Migration Stages](#migration-stages)
4. [Code Upgrade Tool](#code-upgrade-tool)
5. [Deprecations in Odoo 18](#deprecations-in-odoo-18)
6. [Migration Best Practices](#migration-best-practices)
7. [Real-World Examples](#real-world-examples)
8. [Version Management](#version-management)

---

## Migration Script Structure

### Directory Layout

Migration scripts are organized in versioned directories within your module:

```python
<module>/
├── __init__.py
├── __manifest__.py
├── models/
├── migrations/
│   ├── 1.0/
│   │   ├── pre-update_table_x.py
│   │   ├── post-create_plop_records.py
│   │   └── end-cleanup.py
│   ├── 9.0.1.1/           # Server-specific version
│   ├── 16.0.1.0/          # Odoo 16.0 only
│   ├── 17.0.2.1/          # Odoo 17.0 only
│   ├── 0.0.0/             # Runs on any version change
│   └── tests/
└── upgrades/              # Alternative location
    └── 1.1/
        └── pre-migrate.py
```

### Migration Script Function Signature

```python
# File: migrations/18.0.1.0/pre-migrate_data.py

def migrate(cr, version):
    """
    Migration script for Odoo 18.0

    Args:
        cr: Database cursor (SQL operations)
        version: Previously installed version (None for new installs)
    """
    if version is None:
        return  # New installation, skip migration

    # Your migration code here
    cr.execute("""
        UPDATE your_model
        SET field_name = 'new_value'
        WHERE condition = true
    """)
```

**Valid Parameter Signatures:**
- `(cr, version)` - Recommended
- `(cr, _version)` - If version is unused
- `(_cr, version)` - If cr is unused (rare)
- `(_cr, _version)` - If both unused (rare)

### Version Format

The migration system supports these version formats:

```python
# VERSION_RE pattern from odoo/modules/migration.py
^(6.1|6.0-18.0|saas~11-99)\.?  # Optional server version prefix
\d+\.\d+(\.\d+)?              # Module version (x.y or x.y.z)

# Examples:
16.0.1.0   # Odoo 16.0, module version 1.0
17.0.2.1   # Odoo 17.0, module version 2.1
0.0.0      # Any version change
18.0       # Odoo 18.0, module version 0
```

---

## Module Upgrade Hooks

### Manifest Hooks (`__manifest__.py`)

```python
# File: __manifest__.py

{
    'name': 'My Module',
    'version': '18.0.1.0',

    # Hooks executed during module lifecycle
    'pre_init_hook': 'pre_init_function',      # Before installation
    'post_init_hook': 'post_init_function',     # After installation
    'uninstall_hook': 'uninstall_function',     # Before uninstallation
}
```

### pre_init_hook

Runs **before** the module is installed. Use for:
- Checking prerequisites
- Preparing data structures
- Validating system requirements

```python
# File: __init__.py

def pre_init_function(env):
    """Check system requirements before installation."""
    # Example: Check if required module is installed
    if not env['ir.module.module'].search([('name', '=', 'required_module')]):
        raise ValueError('Required module must be installed first')

    # Example: Create custom database tables
    env.cr.execute("""
        CREATE TABLE IF NOT EXISTS custom_table (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255)
        )
    """)
```

### post_init_hook

Runs **after** the module is installed. Use for:
- Creating initial data
- Setting up configurations
- Initializing default values

```python
def post_init_function(env):
    """Initialize data after installation."""
    # Create default records
    env['my.model'].create([
        {'name': 'Default Record 1', 'code': 'DEFAULT1'},
        {'name': 'Default Record 2', 'code': 'DEFAULT2'},
    ])

    # Configure ir.config_parameter
    env['ir.config_parameter'].set_param('my_module.key', 'default_value')
```

### uninstall_hook

Runs **before** the module is uninstalled. Use for:
- Cleaning up custom tables
- Removing generated files
- Reverting system changes

```python
def uninstall_function(env):
    """Clean up before uninstallation."""
    # Drop custom tables
    env.cr.execute("DROP TABLE IF EXISTS custom_table")

    # Remove generated files
    import os
    path = os.path.join('/filestore', 'my_module')
    if os.path.exists(path):
        shutil.rmtree(path)
```

### Hook Execution Order

```
Module Upgrade Process:
├── For each module being upgraded:
│   ├── Run 'pre' migrations
│   ├── Load Python module
│   ├── Execute pre_init_hook (if new install)
│   ├── Create/update database tables
│   ├── Load data files (XML, CSV)
│   ├── Run 'post' migrations
│   └── Execute post_init_hook (if new install)
└── After all modules:
    └── Run 'end' migrations
```

---

## Migration Stages

### Pre-Stage (`pre-*.py`)

Runs **before** module initialization:
- Tables may not exist yet
- Models are not loaded
- Use raw SQL for data manipulation

```python
# File: migrations/18.0.1.0/pre-update_schema.py

def migrate(cr, version):
    """Update database schema before models are loaded."""
    # Add new column
    cr.execute("""
        ALTER TABLE your_model
        ADD COLUMN IF NOT EXISTS new_field VARCHAR(255)
    """)

    # Migrate data from old field
    cr.execute("""
        UPDATE your_model
        SET new_field = old_field
        WHERE new_field IS NULL
    """)
```

### Post-Stage (`post-*.py`)

Runs **after** module initialization:
- Tables and models are loaded
- Can use ORM (`api.Environment`)
- Best for data migrations

```python
# File: migrations/18.0.1.0/post-migrate_data.py

def migrate(cr, version):
    """Migrate data using ORM after models are loaded."""
    from odoo import api
    env = api.Environment(cr, 1, {})  # SUPERUSER_ID = 1

    # Example: Split name into first_name and last_name
    Partner = env['res.partner']
    partners = Partner.search([('name', '!=', False)])

    for partner in partners:
        names = partner.name.split(' ', 1)
        partner.write({
            'first_name': names[0],
            'last_name': names[1] if len(names) > 1 else '',
        })
```

### End-Stage (`end-*.py`)

Runs **after ALL modules have been updated:
- Can reference models from other modules
- Use for cross-module data consistency

```python
# File: migrations/18.0.1.0/end-update_references.py

def migrate(cr, version):
    """Update cross-module references after all modules loaded."""
    from odoo import api
    env = api.Environment(cr, 1, {})

    # Update references to other module's models
    sales = env['sale.order'].search([])
    for order in sales:
        # Update fields that depend on other modules
        if order.partner_id.country_id.code == 'US':
            order.write({'warehouse_id': env.ref('stock.stock_warehouse_us').id})
```

### Stage Execution Order for `0.0.0`

Version `0.0.0` scripts have special execution order:

```python
migrations/0.0.0/
├── pre-script.py  # Runs FIRST (before any other migrations)
├── post-script.py # Runs LAST (after any other migrations)
└── end-script.py  # Runs LAST among end-stage scripts
```

---

## Code Upgrade Tool

### Command-Line Usage

Odoo 18 provides a tool for automated source code transformations:

```bash
# Upgrade from one version to another
./odoo-bin upgrade_code --from 17.0 --to 18.0

# Run specific upgrade script
./odoo-bin upgrade_code --script 17.5-01-tree-to-list

# Upgrade specific addons
./odoo-bin upgrade_code --addons-path=/path/to/addons --from 17.0 --to 18.0
```

### Upgrade Script Template

```python
# File: odoo/upgrade_code/18.0-01-example.py

def upgrade(file_manager):
    """
    Upgrade script for transforming source code.

    Args:
        file_manager: Provides access to all source files
    """
    total = len(file_manager)

    for i, file in enumerate(file_manager, 1):
        # Process Python files
        if file.path.suffix == '.py':
            file.content = file.content.replace('old_pattern', 'new_pattern')

        # Process XML files
        elif file.path.suffix == '.xml':
            file.content = file.content.replace('<tree', '<list')

        # Print progress
        file_manager.print_progress(i, total)
```

### Built-in Upgrade Scripts

Located in `/Users/unclecat/dtg/odoo/odoo/upgrade_code/`:

```python
# 17.5-01-tree-to-list.py
# Converts 'tree' views to 'list' views (Odoo 17+ naming change)

def upgrade(file_manager):
    for file in file_manager:
        if file.path.suffix == '.xml':
            file.content = re.sub(
                r'(<record\s+[^>]*?)tree',
                r'\1list',
                file.content
            )
```

---

## Deprecations in Odoo 18

### Manifest File Deprecation

```python
# DEPRECATED (since Odoo 17)
__openerp__.py

# Use instead
__manifest__.py
```

**Warning:**
```python
DeprecationWarning: __openerp__.py manifests are deprecated since 17.0,
rename to __manifest__.py
```

### API Method Deprecations

```python
# DEPRECATED (Odoo 18+)
records.check_access_rights(operation, raise_exception=True)
records.check_access_rule(operation)

# Use instead
records.check_access(operations=[operation])
```

### XML Declaration Deprecation

```xml
<!-- DEPRECATED (since Odoo 17) -->
<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <record model="ir.ui.view" id="view_form">
        <field name="name">my.model.form</field>
    </record>
</odoo>

<!-- XML declaration in HTML descriptions is deprecated -->
<!-- Use plain HTML without XML declaration -->
```

### Version-Specific Deprecations

```python
# Odoo 17+
# - __openerp__.py manifests
# - XML declarations in module descriptions

# Odoo 18+
# - check_access_rights() → check_access()
# - check_access_rule() → check_access()
# - _filter_access_rules() → _filtered_access()
# - _filter_access_rules_python() → _filtered_access()
```

---

## Migration Best Practices

### 1. Use Raw SQL for Performance

For large data migrations, use SQL instead of ORM:

```python
def migrate(cr, version):
    # GOOD: Fast SQL for bulk updates
    cr.execute("""
        UPDATE sale_order_line
        SET price_unit = COALESCE(
            (SELECT list_price FROM product_product
             WHERE product_product.id = sale_order_line.product_id),
            0.0
        )
    """)

    # AVOID: Slow ORM loop
    # env = api.Environment(cr, 1, {})
    # for line in env['sale.order.line'].search([]):
    #     line.price_unit = line.product_id.list_price
```

### 2. Handle NULL Version (New Installs)

```python
def migrate(cr, version):
    # Always check for new installations
    if version is None:
        return

    # Only run on upgrades from previous versions
    if parse_version(version) < parse_version('17.0.1.0'):
        # Specific migration for old versions
        pass
```

### 3. Use Environment for ORM Access

```python
from odoo import api

def migrate(cr, version):
    # Create environment with SUPERUSER_ID
    env = api.Environment(cr, 1, {})

    # Now use ORM normally
    products = env['product.product'].search([])
    for product in products:
        product.write({'default_code': product.code})
```

### 4. Batch Large Operations

```python
def migrate(cr, version):
    # Process in batches to avoid memory issues
    batch_size = 1000
    offset = 0

    while True:
        cr.execute("""
            SELECT id FROM large_table
            ORDER BY id
            LIMIT %s OFFSET %s
        """, (batch_size, offset))

        ids = [row[0] for row in cr.fetchall()]
        if not ids:
            break

        # Process batch
        cr.execute("""
            UPDATE large_table
            SET processed = true
            WHERE id = ANY(%s)
        """, (ids,))

        offset += batch_size
        cr.commit()  # Commit each batch
```

### 5. Add Rollback Protection

```python
def migrate(cr, version):
    try:
        # Migration code here
        cr.execute("ALTER TABLE model ADD COLUMN new_field VARCHAR")
    except Exception as e:
        # Log error but don't fail entire upgrade
        import logging
        logger = logging.getLogger(__name__)
        logger.warning("Migration failed: %s", e)
```

### 6. Test Migrations

```python
# File: migrations/18.0.1.0/tests/test_migration.py

from odoo.tests import TransactionCase

class TestMigration(TransactionCase):
    def test_migration(self):
        """Test that migration runs without errors."""
        # Simulate old version
        self.cr.execute("UPDATE ir_module_module SET latest_version = '17.0.1.0'")

        # Run migration
        from odoo.modules import migration
        manager = migration.MigrationManager(self.cr, 'my_module')
        manager.migrate_module(['my_module'], 'post')

        # Verify results
        self.cr.execute("SELECT COUNT(*) FROM my_model WHERE new_field IS NOT NULL")
        self.assertGreater(self.cr.fetchone()[0], 0)
```

---

## Real-World Examples

### Example 1: Field to Property Migration

```python
# File: addons/purchase/migrations/9.0.1.2/pre-create-properties.py

def migrate(cr, version):
    """Convert field to ir.property for multi-company support."""

    def convert_field(cr, model, field, target_model):
        # Get existing values
        cr.execute("""
            SELECT id, {field}, company_id
            FROM {table}
            WHERE {field} IS NOT NULL
        """.format(field=field, table=model.replace('.', '_')))

        # Insert as properties
        for record_id, value, company_id in cr.fetchall():
            cr.execute("""
                INSERT INTO ir_property (
                    name, type, fields_id,
                    company_id, value_reference, res_id
                )
                VALUES (
                    %s, 'many2one',
                    (SELECT id FROM ir_model_fields
                     WHERE model = %s AND name = %s),
                    %s, %s, %s
                )
            """, (field, model, field, company_id,
                  f'{target_model},{value}', f'{model},{record_id}'))

        # Drop old column
        cr.execute(f'ALTER TABLE "{model.replace(".", "_")}" DROP COLUMN "{field}"')

    convert_field(cr, 'purchase.order', 'warehouse_id', 'stock.warehouse')
```

### Example 2: UUID Deduplication

```python
# File: addons/point_of_sale/upgrades/1.0.2/post-deduplicate-uuids.py

def migrate(cr, version):
    """Fix duplicate UUIDs from upgrade."""

    def deduplicate_uuids(table):
        # Find duplicates
        cr.execute(f"""
            SELECT UNNEST(ARRAY_AGG(id))
            FROM {table}
            WHERE uuid IS NOT NULL
            GROUP BY uuid
            HAVING COUNT(*) > 1
        """)

        for record_ids in cr.fetchall():
            # Keep first, regenerate rest
            record_ids = list(record_ids)
            for record_id in record_ids[1:]:
                cr.execute(f"""
                    UPDATE {table}
                    SET uuid = gen_random_uuid()
                    WHERE id = %s
                """, (record_id,))

    deduplicate_uuids('pos_order')
    deduplicate_uuids('pos_order_line')
```

### Example 3: Tag Migration with SQL

```python
# File: addons/l10n_nl/migrations/3.3/post-migrate_update_taxes.py

def migrate(cr, version):
    """Update tax tags with SQL for performance."""
    from odoo.tools import SQL

    env = api.Environment(cr, 1, {})

    # Find old and new tags
    old_tag = env.ref('l10n_nl.tax_tag_old', raise_if_not_found=False)
    new_tag = env.ref('l10n_nl.tax_tag_new', raise_if_not_found=False)

    if old_tag and new_tag:
        # Use SQL for bulk update
        cr.execute(SQL("""
            UPDATE account_account_tag_account_tax_repartition_line_rel
            SET account_account_tag_id = %(new_tag)s
            WHERE account_account_tag_id = %(old_tag)s
        """), {'old_tag': old_tag.id, 'new_tag': new_tag.id}))
```

### Example 4: Currency Migration

```python
# File: migrations/18.0.1.0/post-migrate_currency.py

def migrate(cr, version):
    """Migrate to multi-currency support."""
    from odoo import api

    env = api.Environment(cr, 1, {})

    # Get company currency
    company = env['res.company'].search([], limit=1)
    currency_id = company.currency_id.id

    # Add currency field to existing records
    cr.execute("""
        UPDATE sale_order
        SET currency_id = %s
        WHERE currency_id IS NULL
    """, (currency_id,))

    # Update pricelist currency
    cr.execute("""
        UPDATE product_pricelist
        SET currency_id = %s
        WHERE currency_id IS NULL
    """, (currency_id,))
```

### Example 5: Many2many Relationship Migration

```python
# File: migrations/18.0.1.0/post-migrate_m2m.py

def migrate(cr, version):
    """Migrate Many2many relationship to new model."""
    from odoo import api

    env = api.Environment(cr, 1, {})

    # Create new relationship records
    cr.execute("""
        INSERT INTO model1_model2_rel (model1_id, model2_id)
        SELECT m1.id, m2.id
        FROM old_table ot
        JOIN model1 m1 ON ot.old_field1 = m1.old_id
        JOIN model2 m2 ON ot.old_field2 = m2.old_id
        ON CONFLICT DO NOTHING
    """)

    # Drop old table
    cr.execute("DROP TABLE IF EXISTS old_table")
```

---

## Version Management

### Version Parsing

```python
from odoo.tools.parse_version import parse_version

# Parse versions for comparison
v1 = parse_version('17.0.1.0')
v2 = parse_version('18.0.0.1')

if v2 > v1:
    print("v2 is newer")

# Supports semantic versioning
parse_version('18.0.1.0.alpha')  # Pre-release
parse_version('18.0.1.0.beta1')   # Beta
parse_version('18.0.1.0.rc2')     # Release candidate
```

### Version Adaptation

```python
# From odoo/modules/module.py
def adapt_version(version):
    """Adapts module version to current Odoo series."""
    serie = release.major_version  # e.g., "18.0"

    if version == serie or not version.startswith(serie + '.'):
        version = f'{serie}.{version}'

    # Validates format: x.y or x.y.z or serie.x.y or serie.x.y.z
    return version

# Examples:
adapt_version('1.0')      # → '18.0.1.0'
adapt_version('18.0.1.0') # → '18.0.1.0'
```

### Version-Specific Migrations

```python
def migrate(cr, version):
    """Handle migration from multiple previous versions."""

    if version is None:
        return  # New installation

    parsed_version = parse_version(version)

    # Migrate from 16.0
    if parsed_version < parse_version('17.0'):
        cr.execute("UPDATE model SET field = 'v16_value'")

    # Migrate from 17.0
    if parsed_version < parse_version('18.0'):
        cr.execute("UPDATE model SET field = 'v17_value'")

    # Migrate to 18.0
    cr.execute("UPDATE model SET field = 'v18_value'")
```

---

## Additional Resources

### Key Files Reference

| File Path | Purpose |
|-----------|---------|
| `/odoo/modules/migration.py` | Core migration system |
| `/odoo/modules/loading.py` | Module loading & upgrade orchestration |
| `/odoo/modules/module.py` | Module discovery & version management |
| `/odoo/modules/registry.py` | Model registry management |
| `/odoo/cli/upgrade_code.py` | Source code upgrade tool |
| `/odoo/tools/parse_version.py` | Version parsing utilities |
| `/addons/base/models/ir_module.py` | Module model & operations |
| `/odoo/upgrade_code/` | Automated upgrade scripts |

### Testing Migrations

```python
# Test migration with upgrade
python odoo-bin -d test_db --init=your_module --test-enable

# Test specific migration
python odoo-bin -d test_db --update=your_module --test-enable
```

### Debug Mode

```bash
# Enable logging for migration debugging
./odoo-bin --log-level=debug --log-handler=odoo.modules.migration:DEBUG
```

### Quick Reference

```python
# Migration script template
def migrate(cr, version):
    """
    Odoo 18 Migration Script

    Args:
        cr: Database cursor
        version: Previously installed version
    """
    # Check for new install
    if version is None:
        return

    # Migration code here
    pass
```


---

---
name: odoo-18-mixins
description: Complete reference for Odoo 18 mixins and useful classes. Covers mail.thread (messaging, chatter, field tracking), mail.alias.mixin, mail.activity.mixin, utm.mixin, website.published.mixin, website.seo.metadata, and rating.mixin.
globs: "**/models/**/*.py"
topics:
  - mail.thread (messaging, chatter, followers)
  - mail.alias.mixin (email aliases)
  - mail.activity.mixin (activities)
  - utm.mixin (campaign tracking)
  - website.published.mixin (website visibility)
  - website.seo.metadata (SEO)
  - rating.mixin (customer ratings)
when_to_use:
  - Adding messaging/chatter to models
  - Setting up email aliases
  - Adding activities to models
  - Tracking marketing campaigns
  - Creating website-publishable content
  - Implementing customer ratings
---

# Odoo 18 Mixins Guide

Complete reference for Odoo 18 mixins: messaging, email, activities, tracking, website features, and ratings.

## Table of Contents

1. [mail.thread - Messaging](#mailthread---messaging)
2. [mail.alias.mixin - Email Aliases](#mailaliasmixin---email-aliases)
3. [mail.activity.mixin - Activities](#mailactivitymixin---activities)
4. [utm.mixin - Campaign Tracking](#utmmixin---campaign-tracking)
5. [website.published.mixin - Website Visibility](#websitepublishedmixin---website-visibility)
6. [website.seo.metadata - SEO](#websiteseometadata---seo)
7. [rating.mixin - Customer Ratings](#ratingmixin---customer-ratings)

---

## mail.thread - Messaging

### Basic Messaging Integration

The `mail.thread` mixin provides full messaging capabilities: chatter, followers, messages, and field tracking.

#### Minimal Setup

```python
from odoo import models, fields

class BusinessTrip(models.Model):
    _name = 'business.trip'
    _inherit = ['mail.thread']
    _description = 'Business Trip'

    name = fields.Char()
    partner_id = fields.Many2one('res.partner', 'Responsible')
    guest_ids = fields.Many2many('res.partner', 'Participants')
```

#### Form View Integration

```xml
<record id="business_trip_form" model="ir.ui.view">
    <field name="name">business.trip.form</field>
    <field name="model">business.trip</field>
    <field name="arch" type="xml">
        <form string="Business Trip">
            <!-- Your fields -->
            <group>
                <field name="name"/>
                <field name="partner_id"/>
                <field name="guest_ids" widget="many2many_tags"/>
            </group>
            <!-- Chatter integration -->
            <chatter open_attachments="True"/>
        </form>
    </field>
</record>
```

#### Chatter Options

| Option | Description |
|--------|-------------|
| `open_attachments` | Show attachment section expanded by default |
| `reload_on_attachment` | Reload form when attachments change |
| `reload_on_follower` | Reload form when followers change |
| `reload_on_post` | Reload form when messages posted |

### Field Tracking

Automatically log field changes in the chatter.

```python
class BusinessTrip(models.Model):
    _name = 'business.trip'
    _inherit = ['mail.thread']

    name = fields.Char(tracking=True)  # Track changes
    partner_id = fields.Many2one('res.partner', tracking=True)
    guest_ids = fields.Many2many('res.partner')
    state = fields.Selection([
        ('draft', 'New'),
        ('confirmed', 'Confirmed'),
    ], tracking=True)
```

Every change to `name`, `partner_id`, or `state` will log a note in the chatter.

### Posting Messages

#### message_post() - Post a Message

```python
def send_notification(self):
    self.message_post(
        body='Trip has been confirmed!',
        subject='Trip Confirmation',
        message_type='notification',
        subtype_xmlid='mail.mt_comment',
    )
```

#### message_post() with HTML

```python
from markupsafe import Markup

def send_html_notification(self):
    self.message_post(
        body=Markup('<strong>Trip confirmed!</strong>'),
        subject='Trip Confirmation',
    )
```

#### message_post() with Attachments

```python
def send_with_attachment(self):
    self.message_post(
        body='Please review attached document',
        attachments=[
            ('document.pdf', pdf_content),
            ('summary.txt', summary_text),
        ]
    )
```

#### message_post_with_template() - Use QWeb Template

```python
def send_template_email(self):
    self.message_post_with_template(
        template_id=self.env.ref('my_module.email_template').id,
    )
```

### Followers Management

#### message_subscribe() - Add Followers

```python
# Add partners
record.message_subscribe(
    partner_ids=[partner1_id, partner2_id]
)

# Add channels
record.message_subscribe(
    channel_ids=[channel1_id, channel2_id]
)

# Add with specific subtypes
record.message_subscribe(
    partner_ids=[partner_id],
    subtype_ids=[self.env.ref('mail.mt_comment').id]
)

# Force: remove existing followers first
record.message_subscribe(
    partner_ids=[new_partner_id],
    force=True
)
```

#### message_unsubscribe() - Remove Followers

```python
# Remove partners
record.message_unsubscribe(partner_ids=[partner_id])

# Remove channels
record.message_unsubscribe(channel_ids=[channel_id])

# Remove users
record.message_unsubscribe_users(user_ids=[user_id])
```

### Subtypes - Notification Control

Subtypes classify notifications, allowing users to customize what they receive.

#### Creating a Subtype

```xml
<record id="mt_state_change" model="mail.message.subtype">
    <field name="name">Trip Confirmed</field>
    <field name="res_model">business.trip</field>
    <field name="default" eval="True"/>
    <field name="description">Business Trip confirmed!</field>
    <field name="internal" eval="False"/>
</record>
```

#### Subtype Fields

| Field | Description |
|-------|-------------|
| `name` | Display name in notification popup |
| `description` | Message added when posted |
| `internal` | If `True`, only visible to employees |
| `parent_id` | Link to parent subtype (for auto-subscription) |
| `relation_field` | Field linking to parent (e.g., `project_id`) |
| `res_model` | Model this applies to (`False` = all models) |
| `default` | Activated by default when subscribing |
| `hidden` | Hidden in notification customization popup |

#### _track_subtype() - Trigger Specific Subtype

```python
class BusinessTrip(models.Model):
    _name = 'business.trip'
    _inherit = ['mail.thread']

    state = fields.Selection([
        ('draft', 'New'),
        ('confirmed', 'Confirmed'),
    ], tracking=True)

    def _track_subtype(self, init_values):
        self.ensure_one()
        if 'state' in init_values and self.state == 'confirmed':
            return 'my_module.mt_state_change'
        return super(BusinessTrip, self)._track_subtype(init_values)
```

### Customizing Notifications

#### _notify_get_groups() - Custom Action Buttons

```python
class BusinessTrip(models.Model):
    _name = 'business.trip'
    _inherit = ['mail.thread']

    def action_cancel(self):
        self.write({'state': 'draft'})

    def _notify_get_groups(self, message, groups):
        groups = super(BusinessTrip, self)._notify_get_groups(message, groups)

        self.ensure_one()
        if self.state == 'confirmed':
            cancel_link = self._notify_get_action_link('method', method='action_cancel')
            trip_actions = [{'url': cancel_link, 'title': _('Cancel')}]

        # Add custom group
        new_group = (
            'group_trip_manager',
            lambda partner: any(
                user.sudo().has_group('business.group_trip_manager')
                for user in partner.user_ids
            ),
            {'actions': trip_actions},
        )

        return [new_group] + groups
```

#### _notify_get_action_link() - Generate Links

```python
# View link
view_link = self._notify_get_action_link('view')

# Assign link
assign_link = self._notify_get_action_link('assign')

# Follow/Unfollow
follow_link = self._notify_get_action_link('follow')
unfollow_link = self._notify_get_action_link('unfollow')

# Custom method
method_link = self._notify_get_action_link('method', method='action_do_something')

# New record
new_link = self._notify_get_action_link('new', action_id='action_id')
```

### Context Keys for Control

| Key | Effect |
|-----|--------|
| `mail_create_nosubscribe` | Don't subscribe current user on create |
| `mail_create_nolog` | Don't log 'Document created' message |
| `mail_notrack` | Don't perform value tracking |
| `tracking_disable` | Disable all MailThread features |
| `mail_auto_delete` | Auto delete notifications (default: `True`) |
| `mail_notify_force_send` | Send directly if < 50 emails (default: `True`) |

```python
# Example: create without auto-subscription
record = self.env['business.trip'].with_context(
    mail_create_nosubscribe=True
).create({'name': 'Trip'})
```

### _mail_post_access

Control required access rights to post messages:

```python
class MyModel(models.Model):
    _name = 'my.model'
    _inherit = ['mail.thread']

    _mail_post_access = 'read'  # Default is 'write'
```

---

## mail.alias.mixin - Email Aliases

### Alias Basics

Aliases allow creating records via email without logging into Odoo.

#### Required Overrides

```python
from odoo import models, fields

class BusinessTrip(models.Model):
    _name = 'business.trip'
    _inherit = ['mail.thread', 'mail.alias.mixin']
    _description = 'Business Trip'

    name = fields.Char()
    partner_id = fields.Many2one('res.partner')
    expense_ids = fields.One2many('business.expense', 'trip_id')
    alias_id = fields.Many2one('mail.alias', required=True, ondelete="restrict")

    def _get_alias_model_name(self, vals):
        """Model to create when alias receives email"""
        return 'business.expense'

    def _get_alias_values(self):
        """Default values for the alias"""
        values = super(BusinessTrip, self)._get_alias_values()
        values['alias_defaults'] = {'trip_id': self.id}
        values['alias_contact'] = 'followers'
        return values
```

#### Form View Integration

```xml
<page string="Emails">
    <group name="group_alias">
        <label for="alias_name" string="Email Alias"/>
        <div name="alias_def">
            <field name="alias_id" class="oe_read_only oe_inline" string="Email Alias"/>
            <div class="oe_edit_only oe_inline" style="display: inline;">
                <field name="alias_name" class="oe_inline"/>
                @
                <field name="alias_domain" class="oe_inline" readonly="1"/>
            </div>
        </div>
        <field name="alias_contact" class="oe_inline" string="Accept Emails From"/>
    </group>
</page>
```

### Alias Configuration Fields

| Field | Description |
|-------|-------------|
| `alias_name` | Email alias name (e.g., 'jobs' for jobs@example.com) |
| `alias_user_id` | Owner of created records |
| `alias_defaults` | Python dict of default values |
| `alias_force_thread_id` | If set, all messages go to this thread |
| `alias_contact` | Who can post: `everyone`, `partners`, `followers` |
| `alias_domain` | Email domain (automatic from system) |

### message_new() - Handle Incoming Emails

Override to extract data from incoming emails:

```python
class BusinessExpense(models.Model):
    _name = 'business.expense'
    _inherit = ['mail.thread']

    amount = fields.Float()
    description = fields.Char()
    partner_id = fields.Many2one('res.partner')

    def message_new(self, msg_dict, custom_values=None):
        """Extract data from email"""
        name = msg_dict.get('subject', 'New Expense')

        # Extract amount from subject (last float)
        import re
        amount_pattern = r'(\d+(?:\.\d*)?)'
        prices = re.findall(amount_pattern, name)
        amount = float(prices[-1]) if prices else 0.0

        # Find partner by email
        email = msg_dict.get('from')
        partner = self.env['res.partner'].search([
            ('email', 'ilike', email)
        ], limit=1)

        defaults = {
            'name': name,
            'amount': amount,
            'partner_id': partner.id
        }
        defaults.update(custom_values or {})
        return super(BusinessExpense, self).message_new(msg_dict, defaults)
```

### message_update() - Handle Email Replies

```python
def message_update(self, msg_dict, update_vals=None):
    """Update record from email reply"""
    # Extract data and update
    if 'description' in msg_dict:
        update_vals = update_vals or {}
        update_vals['description'] = msg_dict['description']
    return super(BusinessExpense, self).message_update(msg_dict, update_vals)
```

---

## mail.activity.mixin - Activities

### Activity Integration

Activities are actions users need to take (phone calls, meetings, etc.).

```python
from odoo import models, fields

class BusinessTrip(models.Model):
    _name = 'business.trip'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'Business Trip'

    name = fields.Char()
```

#### Form View Integration

```xml
<form string="Business Trip">
    <!-- Your fields -->
    <chatter>
        <field name="message_follower_ids" widget="mail_followers"/>
        <field name="activity_ids" widget="mail_activity"/>
        <field name="message_ids" widget="mail_thread"/>
    </chatter>
</form>
```

#### Kanban View Integration

```xml
<kanban>
    <field name="activity_ids"/>
    <field name="activity_state"/>
    <templates>
        <t t-name="kanban-box">
            <div>
                <!-- Your content -->
                <div class="oe_kanban_activity"/>
            </div>
        </t>
    </templates>
</kanban>
```

### Activity Methods

The mixin provides these methods:

| Method | Description |
|--------|-------------|
| `activity_schedule()` | Schedule an activity |
| `activity_unlink()` | Remove activities |
| `action_feedback()` | Add feedback to activity |

```python
# Schedule activity
record.activity_schedule(
    'mail.mail_activity_data_todo',
    user_id=user_id,
    summary='Review trip',
    note='Please review and approve',
    date_deadline=date.today()
)

# Mark as done
record.action_feedback(
    feedback='Approved!',
    feedback_type='done'
)
```

---

## utm.mixin - Campaign Tracking

### UTM Tracking

Track marketing campaigns through URL parameters (campaign, source, medium).

```python
from odoo import models, fields

class Lead(models.Model):
    _name = 'crm.lead'
    _inherit = ['utm.mixin']
    _description = 'Lead'

    name = fields.Char()
```

#### Added Fields

| Field | Type | Description |
|-------|------|-------------|
| `campaign_id` | Many2one | UTM Campaign (e.g., Christmas_Special) |
| `source_id` | Many2one | UTM Source (e.g., Search Engine) |
| `medium_id` | Many2one | UTM Medium (e.g., Email, Social Network) |

#### How It Works

1. User visits: `https://myodoo.com/?campaign_id=winter_sale&source_id=google`
2. Cookies are set for these parameters
3. When a record is created from website form, values are fetched from cookies
4. Campaign/source/medium fields are automatically populated

### Extending UTM Tracking

```python
class MyTrack(models.Model):
    _name = 'my.track'
    _description = 'Custom Tracking'

    name = fields.Char(required=True)

class MyModel(models.Model):
    _name = 'my.model'
    _inherit = ['utm.mixin']

    my_field = fields.Many2one('my.track', 'My Field')

    @api.model
    def tracking_fields(self):
        result = super(MyModel, self).tracking_fields()
        result.append([
            # ("URL_PARAMETER", "FIELD_NAME_MIXIN", "COOKIE_NAME")
            ('my_field', 'my_field', 'odoo_utm_my_field')
        ])
        return result
```

This creates a cookie `odoo_utm_my_field` and sets `my_field` on new records.

---

## website.published.mixin - Website Visibility

### Website Publishing

Control whether records are visible on the website.

```python
from odoo import models, fields

class BlogPost(models.Model):
    _name = 'blog.post'
    _inherit = ['website.published.mixin']
    _description = 'Blog Post'

    name = fields.Char()
    website_url = fields.Char()  # Must be defined

    def _compute_website_url(self):
        for post in self:
            post.website_url = f"/blog/{post.id}"
```

#### Added Fields

| Field | Type | Description |
|-------|------|-------------|
| `website_published` | Boolean | Publication status |
| `website_url` | Char | URL to access the record |

#### Backend Button

```xml
<div name="button_box">
    <button class="oe_stat_button" name="website_publish_button" type="object" icon="fa-globe">
        <field name="website_published" widget="website_button"/>
    </button>
</div>
```

#### Frontend Button

```xml
<div id="website_published_button" class="float-right" groups="base.group_website_publisher">
    <t t-call="website.publish_management">
        <t t-set="object" t-value="blog_post"/>
        <t t-set="publish_edit" t-value="True"/>
        <t t-set="action" t-value="'blog.blog_post_action'"/>
    </t>
</div>
```

---

## website.seo.metadata - SEO

### SEO Metadata

Inject metadata into frontend pages for search engines.

```python
from odoo import models, fields

class BlogPost(models.Model):
    _name = 'blog.post'
    _inherit = ['website.seo.metadata', 'website.published.mixin']
    _description = 'Blog Post'

    name = fields.Char()
```

#### Added Fields

| Field | Type | Description |
|-------|------|-------------|
| `website_meta_title` | Char | Additional page title |
| `website_meta_description` | Char | Short description for search results |
| `website_meta_keywords` | Char | Keywords for search engine classification |

These fields are editable via the "Promote" tool in the website editor.

---

## rating.mixin - Customer Ratings

### Rating Integration

Allow sending rating requests and aggregating statistics.

```python
from odoo import models, fields

class ProjectTask(models.Model):
    _name = 'project.task'
    _inherit = ['rating.mixin', 'mail.thread']
    _description = 'Task'

    name = fields.Char()
    user_id = fields.Many2one('res.users', 'Responsible')
    partner_id = fields.Many2one('res.partner', 'Customer')
```

#### Behavior

The mixin automatically:
- Links `rating.rating` records to `partner_id` field (if exists)
- Links to `user_id` partner (if exists)
- Displays rating events in chatter (if inherits `mail.thread`)

#### Override Partner Fields

```python
class MyModel(models.Model):
    _inherit = ['rating.mixin', 'mail.thread']

    def rating_get_partner_id(self):
        """Override to use different field"""
        return self.my_custom_partner_id

    def rating_get_rated_partner_id(self):
        """Override to specify who is being rated"""
        return self.user_id.partner_id
```

### Send Rating Request Email

```xml
<record id="rating_email_template" model="mail.template">
    <field name="name">Rating Request</field>
    <field name="subject">Service Rating</field>
    <field name="model_id" ref="model_my_model"/>
    <field name="partner_to">${object.rating_get_partner_id().id}</field>
    <field name="auto_delete" eval="True"/>
    <field name="body_html"><![CDATA[
        % set access_token = object.rating_get_access_token()
        <p>How satisfied are you?</p>
        <ul>
            <li><a href="/rate/${access_token}/5">Satisfied</a></li>
            <li><a href="/rate/${access_token}/3">Okay</a></li>
            <li><a href="/rate/${access_token}/1">Dissatisfied</a></li>
        </ul>
    ]]></field>
</record>
```

### Rating Action

```xml
<record id="rating_action" model="ir.actions.act_window">
    <field name="name">Customer Ratings</field>
    <field name="res_model">rating.rating</field>
    <field name="view_mode">kanban,pivot,graph</field>
    <field name="domain">[
        ('res_model', '=', 'my.model'),
        ('res_id', '=', active_id),
        ('consumed', '=', True)
    ]</field>
</record>
```

#### Add Rating Button

```xml
<xpath expr="//div[@name='button_box']" position="inside">
    <button name="%(rating_action)d" type="action" class="oe_stat_button" icon="fa-smile-o">
        <field name="rating_count" string="Rating" widget="statinfo"/>
    </button>
</xpath>
```

---

## Quick Reference

### Mixin Comparison

| Mixin | Purpose | Key Features |
|-------|---------|--------------|
| `mail.thread` | Messaging | Chatter, followers, field tracking |
| `mail.alias.mixin` | Email | Create records via email |
| `mail.activity.mixin` | Activities | Schedule activities |
| `utm.mixin` | Marketing | Campaign tracking |
| `website.published.mixin` | Website | Publish/unpublish toggle |
| `website.seo.metadata` | SEO | Meta title, description, keywords |
| `rating.mixin` | Ratings | Customer feedback system |

### Common Combinations

```python
# Standard document model
_inherit = ['mail.thread']

# Document with activities
_inherit = ['mail.thread', 'mail.activity.mixin']

# Website content
_inherit = ['website.published.mixin', 'website.seo.metadata']

# Model with email processing
_inherit = ['mail.thread', 'mail.alias.mixin']

# CRM-style model
_inherit = ['mail.thread', 'mail.activity.mixin', 'utm.mixin', 'rating.mixin']

# Full-featured website model
_inherit = ['mail.thread', 'mail.activity.mixin', 'website.published.mixin',
            'website.seo.metadata', 'utm.mixin']
```

---

**For more Odoo 18 guides, see [SKILL.md](../SKILL.md)**


---

---
name: odoo-18-model
description: Complete reference for Odoo 18 ORM model methods, CRUD operations, domain syntax, and recordset handling. Use this guide when writing model methods, ORM queries, search operations, or working with recordsets.
globs: "**/models/**/*.py"
topics:
  - Recordset basics (browse, exists, empty)
  - Search methods (search, search_read, search_count)
  - Aggregation methods (_read_group core, read_group for UI)
  - CRUD operations (create, read, write, unlink)
  - Domain syntax (operators, logical, relational)
  - Environment context (with_context, with_user, with_company)
  - Recordset iteration patterns
when_to_use:
  - Writing ORM queries
  - Performing CRUD operations
  - Building domain filters
  - Using _read_group() for aggregations
  - Iterating over recordsets
  - Using environment context
---

# Odoo 18 Model Guide

Complete reference for Odoo 18 ORM model methods, CRUD operations, and recordset handling.

## Table of Contents

1. [Recordset Basics](#recordset-basics)
2. [Search Methods](#search-methods)
3. [CRUD Operations](#crud-operations)
4. [Domain Syntax](#domain-syntax)
5. [Environment Context](#environment-context)

---

## Recordset Basics

### browse() - Retrieve Records by ID

```python
# Single record
record = self.browse(1)

# Multiple records (returns empty recordset if not found)
records = self.browse([1, 2, 3])

# Empty recordset
empty = self.browse()

# Prefetching: Odoo automatically prefetches up to PREFETCH_MAX (1000) records
# When accessing fields on related records, they are fetched in batch
```

**Important**: `browse()` always returns a recordset, even for IDs that don't exist. Use `.exists()` to filter.

```python
records = self.browse([1, 999, 1000])  # 999, 1000 may not exist
valid_records = records.exists()  # Only existing records
```

### Empty Recordset Pattern

```python
# GOOD: Handle empty recordsets explicitly
if not records:
    return

# GOOD: Use filtered() for conditional operations
records = records.filtered(lambda r: r.active)

# GOOD: Use exists() to remove non-existing records
records = records.exists()
```

---

## Search Methods

### search() - Find Records

```python
# Basic search - returns recordset
records = self.search([('state', '=', 'draft')])

# With limit and order
records = self.search(
    [('state', '=', 'draft')],
    limit=10,
    order='date DESC'
)

# With offset
records = self.search(
    [('state', '=', 'draft')],
    offset=10,
    limit=10
)

# Complex domain
records = self.search([
    '&',
    ('state', '=', 'draft'),
    '|',
    ('date', '>=', '2024-01-01'),
    ('date', '=', False)
])
```

### search_read() - Find and Read in One Query

**Use when**: You need records as dictionaries, not recordsets.

```python
# Returns list of dicts
data = self.search_read(
    [('state', '=', 'done')],
    ['name', 'date', 'amount']
)
# Result: [{'id': 1, 'name': 'Test', 'date': '...', 'amount': 100.0}, ...]

# With ordering and limit
data = self.search_read(
    [('state', '=', 'done')],
    ['name', 'amount'],
    order='amount desc',
    limit=10
)
```

**Performance**: `search_read()` is more efficient than `search().read()` when you only need specific fields as dicts.

### search_count() - Count Records

```python
count = self.search_count([('state', '=', 'draft')])
# Returns integer
```

### read_group() - Aggregation

```python
# Group by field
result = self.read_group(
    [('state', '=', 'draft')],
    ['amount_total:sum'],
    ['category_id']
)
# Result: [{'category_id': [1, 'Category A'], 'amount_total': 1500.0, '__domain': [...]}]

# With time granularity
result = self.read_group(
    [('date', '>=', '2024-01-01')],
    ['amount:sum'],
    ['date:month']
)

# Multiple groupby
result = self.read_group(
    domain,
    ['amount:sum', 'quantity:avg'],
    ['category_id', 'state']
)
```

### search_fetch() - Search and Fetch Fields (Odoo 18)

**Use when**: You need to search AND prefetch specific fields to cache in one operation.

```python
# Search and fetch fields to cache
records = self.search_fetch(
    [('state', '=', 'done')],
    ['name', 'amount_total', 'partner_id'],
    order='date DESC',
    limit=10
)
# Returns recordset with specified fields already in cache

# Equivalent to but more efficient than:
records = self.search([('state', '=', 'done')], order='date DESC', limit=10)
records.fetch(['name', 'amount_total', 'partner_id'])
```

**Performance**: `search_fetch()` is optimized to fetch specified fields in the same query as the search, minimizing database round trips. Use when you know exactly which fields you'll need.

---

## _read_group Internal Methods (Odoo 18)

These internal methods are used by Odoo's ORM and can be extended when overriding `_read_group()`.

### READ_GROUP Constants

```python
# Time granularity (date_trunc)
READ_GROUP_TIME_GRANULARITY = {
    'hour', 'day', 'week', 'month', 'quarter', 'year'
}

# Number granularity (date_part)
READ_GROUP_NUMBER_GRANULARITY = {
    'year_number': 'year',
    'quarter_number': 'quarter',
    'month_number': 'month',
    'iso_week_number': 'week',
    'day_of_year': 'doy',
    'day_of_month': 'day',
    'day_of_week': 'dow',
    'hour_number': 'hour',
    'minute_number': 'minute',
    'second_number': 'second',
}

# All granularities
READ_GROUP_ALL_TIME_GRANULARITY = READ_GROUP_TIME_GRANULARITY | READ_GROUP_NUMBER_GRANULARITY

# Supported aggregate functions
READ_GROUP_AGGREGATE = {
    'sum', 'avg', 'max',', 'min',
    'bool_and', 'bool_or',
    'array_agg', 'recordset',
    'count', 'count_distinct',
}
```

### Aggregate Specification Format

```
<field_name>:<aggregate>    # e.g., "amount:sum", "quantity:avg"
<field_name>:<granularity>   # e.g., "date:month", "date:year"
<field_name>.<property>:<granularity>  # e.g., "date_deadline:month"
```

### Aggregate Functions Reference

| Aggregate | Description | Example | Result Type |
|-----------|-------------|---------|-------------|
| `__count` | **Count records per group** (special, no field prefix) | `'__count'` | `int` |
| `field:sum` | Sum of field values | `'amount:sum'` | `float`/`int` |
| `field:avg` | Average of field values | `'price:avg'` | `float` |
| `field:max` | Maximum field value | `'date:max'` | field type |
| `field:min` | Minimum field value | `'date:min'` | field type |
| `field:count` | Count non-null values in field | `'partner_id:count'` | `int` |
| `field:count_distinct` | Count distinct non-null values | `'state:count_distinct'` | `int` |
| `field:bool_and` | True if all values are true | `'is_active:bool_and'` | `bool` |
| `field:bool_or` | True if any value is true | `'is_paid:bool_or'` | `bool` |
| `field:array_agg` | Array of all values | `'tag_id:array_agg'` | `list` |
| `field:recordset` | Recordset of all records | `'id:recordset'` | `recordset` |

#### `__count` - Special Count Aggregate

**`__count`** is a **special aggregate** that counts all records in each group, regardless of field values. It does NOT require a field prefix.

```python
# GOOD: __count - counts all records per group
for category, amount_total, count in self._read_group(
    domain=[('state', '=', 'draft')],
    groupby=['category_id'],
    aggregates=['amount_total:sum', '__count'],  # __count: no field prefix!
):
    print(f"{category.name}: {amount_total} ({count} orders)")
    # count = total number of records in this group

# BAD: field:count - only counts non-null values
for category, amount_total, count in self._read_group(
    domain=[('state', '=', 'draft')],
    groupby=['category_id'],
    aggregates=['amount_total:sum', 'amount_total:count'],
):
    # count = only counts records where amount_total IS NOT NULL
```

**Key Difference**:
- `__count` → Counts ALL records in group (like `COUNT(*)`)
- `field:count` → Counts NON-NULL values only (like `COUNT(field)`)
- `field:count_distinct` → Counts distinct non-null values (like `COUNT(DISTINCT field)`)

```python
# Example: Count vs count_distinct
self._read_group(
    domain=[('state', '=', 'done')],
    groupby=['partner_id'],
    aggregates=['__count', 'state:count', 'state:count_distinct'],
)
# __count = total orders per partner
# state:count = orders where state IS NOT NULL (same as __count here)
# state:count_distinct = distinct state values per partner (always 1 here)
```

### _read_group_select (Odoo 18)

Internal method to generate SQL for aggregation.

```python
# Odoo uses this internally
sql_expr = self._read_group_select('amount:sum', query)
# Returns: SQL('SUM(%s)', sql_field)
```

### _read_group_groupby (Odoo 18)

Internal method to generate SQL for groupby.

```python
# Date with granularity
sql_expr = self._read_group_groupby('date:month', query)
# Returns: date_trunc('month', sql_field::timestamp)

# Number granularity
sql_expr = self._read_group_groupby('date:day_of_month', query)
# Returns: date_part('day', sql_field)::int
```

### read_group Result Format

```python
result = self.read_group(
    [('state', '!=', False)],
    ['amount:sum', 'count'],
    ['state', 'date:month'],
)
# Result:
# [
#     {
#         'state': 'draft',
#         'date:month': datetime(2024, 1, 1),
#         'amount': 15000.0,
#         'count': 10,
#         '__domain': [(('state', '=', 'draft'), ...)],
#     },
#     ...
# ]
```

### _read_group() - Core Aggregation Method (Odoo 18)

**`_read_group()`** is the **core aggregation method** that `read_group()` calls internally (see `odoo/models.py:2888`). It returns tuples with proper recordsets for relational fields.

```python
# GOOD: _read_group() - simpler API, returns tuples
for category, amount_total, count in self._read_group(
    domain=[('state', '=', 'draft')],
    groupby=['category_id'],
    aggregates=['amount_total:sum', '__count'],
    order='category_id'
):
    # category: recordset (Many2one field)
    # amount_total: float
    # count: int
    print(f"{category.name}: {amount_total} ({count} orders)")

# Convert to dict for O(1) lookup (pattern from Odoo base)
category_amounts = dict(self._read_group(
    domain=[('state', '=', 'draft')],
    groupby=['category_id'],
    aggregates=['amount_total:sum'],
))
# Result: {category_recordset: amount_total, ...}
```

### read_group() vs _read_group()

| Method | Return Type | API Parameters | Has lazy | Has __domain | When to Use |
|--------|-------------|----------------|---------|--------------|-------------|
| `_read_group()` | List of tuples | `domain, groupby, aggregates` | No | No | Data processing, aggregations (most cases) |
| `read_group()` | List of dicts | `domain, fields, groupby` | Yes | Yes | UI components, reports with drill-down |

**Key Insight**: `_read_group()` is the **core method** called by `read_group()` internally. Both return proper recordsets for relational fields (via `_read_group_postprocess_groupby`).

```python
# _read_group() - Core method with simpler API
for partner, total, count in self._read_group(
    domain=[('state', '=', 'done')],
    groupby=['partner_id'],
    aggregates=['amount_total:sum', '__count'],
):
    print(f"{partner.name}: {total} ({count} orders)")

# read_group() - Public API with metadata for UI
data = self.read_group(
    domain=[('state', '=', 'done')],
    fields=['amount_total'],
    groupby=['partner_id'],
    lazy=True,
)
# Can use __domain for drill-down:
for group in data:
    orders = self.search(group['__domain'])
```

**For extending aggregation behavior**, use these helper methods:
- `_read_group_expand_states()` - Expand selection groups
- `_read_group_select()` - Custom aggregate SQL
- `_read_group_groupby()` - Custom groupby SQL
- `_read_group_fill_results()` - Fill empty groups
- `_read_group_format_result()` - Format results with domain

### group_expand Parameter (Odoo 18)

Expand groups to include all possible values.

```python
# Field with group_expand function
state = fields.Selection(
    selection=lambda self: self._get_states(),
    group_expand='_read_group_expand_states',
)

@api.model
def _read_group_expand_states(self, values, domain):
    # Return all possible states to show empty groups
    return ['draft', 'confirmed', 'done', 'cancel']
```

---

## CRUD Operations

### create() - Create New Records

**Odoo 18**: `create()` expects a list of dicts and returns a recordset.

```python
# Single record (also accepts dict for compatibility)
record = self.create({'name': 'Test', 'state': 'draft'})

# Multiple records - BATCH create (recommended)
records = self.create([
    {'name': 'Record 1', 'state': 'draft'},
    {'name': 'Record 2', 'state': 'draft'},
    {'name': 'Record 3', 'state': 'draft'},
])
# Returns: recordset of 3 records

# With relational fields
records = self.create([{
    'name': 'Test',
    'partner_id': 1,  # many2one
    'line_ids': [(0, 0, {  # one2many - create new line
        'product_id': 1,
        'quantity': 2,
    })],
    'tag_ids': [(6, 0, [1, 2, 3])],  # many2many - replace with these
}])
```

**One2many commands**:
- `(0, 0, {...})` - Create new record
- `(1, id, {...})` - Update existing record
- `(2, id, ...)` - Remove record (delete from db)
- `(3, id, ...)` - Unlink (remove relation)
- `(4, id, ...)` - Link existing record
- `(5, ...)` - Unlink all
- `(6, 0, [ids])` - Replace with these

### read() - Read Field Values

```python
# Read specific fields (returns list of dicts)
data = records.read(['name', 'state', 'date'])
# Result: [{'id': 1, 'name': 'Test', 'state': 'draft', 'date': '...'}, ...]

# Read all fields
data = records.read()

# Load parameter for performance
data = records.read(['name'], load='_classic_read')
```

**Note**: Using record.field access is usually more efficient than `read()` for recordsets due to prefetching.

### write() - Update Records

```python
# Update all records in recordset
records.write({'state': 'done'})

# Update single record
record.write({'name': 'Updated Name'})

# Update multiple fields
records.write({
    'state': 'done',
    'date_done': fields.Datetime.now(),
})
```

**Performance**: `write()` is batched automatically for the recordset.

### unlink() - Delete Records

```python
# Delete all records in recordset
records.unlink()

# Delete with validation
@api.ondelete(at_uninstall=False)
def _unlink_if_not_done(self):
    if any(rec.state == 'done' for rec in self):
        raise UserError("Cannot delete completed records")

# Then in your method
self.unlink()
```

---

## Domain Syntax

### Basic Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | equals | `[('state', '=', 'draft')]` |
| `!=` | not equals | `[('state', '!=', 'draft')]` |
| `>` | greater than | `[('amount', '>', 100)]` |
| `>=` | greater or equal | `[('amount', '>=', 100)]` |
| `<` | less than | `[('amount', '<', 100)]` |
| `<=` | less or equal | `[('amount', '<=', 100)]` |
| `=?` | undefined or equals | `[('partner_id', '=?', user_id)]` |
| `in` | in list | `[('id', 'in', [1, 2, 3])]` |
| `not in` | not in list | `[('id', 'not in', [1, 2, 3])]` |
| `like` | contains (case-sensitive) | `[('name', 'like', 'test')]` |
| `ilike` | contains (case-insensitive) | `[('name', 'ilike', 'TEST')]` |
| `not like` | does not contain | `[('name', 'not like', 'test')]` |
| `=ilike` | contains (case-insensitive, undefined or equals) | `[('name', '=ilike', 'test')]` |
| `=like` | contains (case-sensitive, undefined or equals) | `[('name', '=like', 'test')]` |
| `child_of` | is child (in hierarchy) | `[('category_id', 'child_of', category_id)]` |
| `parent_of` | is parent (in hierarchy) | `[('company_id', 'parent_of', company_id)]` |
| `any` | any related record matches domain | `[('line_ids', 'any', [('state', '=', 'done')])]` |
| `not any` | no related record matches domain | `[('line_ids', 'not any', [('state', '=', 'done')])]` |

### Logical Operators

```python
# AND (implicit - default)
domain = [('state', '=', 'draft'), ('date', '>=', '2024-01-01')]

# OR (explicit)
domain = [
    '|',
    ('state', '=', 'draft'),
    ('state', '=', 'confirmed')
]

# NOT
domain = [('!', ('state', '=', 'draft'))]

# Complex: (A OR B) AND (C OR D)
domain = [
    '&',
    '|',
    ('state', '=', 'draft'),
    ('state', '=', 'confirmed'),
    '|',
    ('date', '>=', '2024-01-01'),
    ('date', '=', False)
]
```

### Relational Field Domains

```python
# Many2one field traversal
domain = [('partner_id.country_id.code', '=', 'US')]

# One2many/Many2many - using any record
domain = [('line_ids.product_id.categ_id', '=', 1)]

# Using related field
domain = [('partner_city', '=', 'New York')]  # if partner_id.city related
```

### Relational Domain Operators (Odoo 18)

```python
# any - matches if ANY related record satisfies the domain
domain = [
    ('invoice_status', '=', 'to invoice'),
    ('order_line', 'any', [('product_id.qty_available', '<=', 0)])  # Has out-of-stock products
]

# not any - matches if NO related record satisfies the domain
domain = [
    ('order_line', 'not any', [('product_id.type', '=', 'service')])  # No service products
]

# parent_of - is parent in hierarchy (inverse of child_of)
domain = [
    ('company_id', 'parent_of', company_id)  # company_id is parent of specified company
]
```

**Important**: `any` and `not any` work with `Many2one`, `One2many`, and `Many2many` fields to check if ANY/NO related record satisfies the given domain.

### Date Field Granularities (Odoo 18)

```python
# Date granularities for domain filtering (returns integer)
domain = [
    ('birthday:day_of_month', '=', 15),     # Day of month (1-31)
    ('birthday:month_number', '=', 2),       # Month number (1-12)
    ('birthday:iso_week_number', '=', 10),    # ISO week number (1-53)
    ('birthday:day_of_year', '=', 100),       # Day of year (1-366)
    ('birthday:day_of_week', '=', 1),         # Day of week (0=Monday, 6=Sunday)
    ('date_order:hour_number', '=', 14),       # Hour (0-23)
    ('date_order:minute_number', '=', 30),     # Minute (0-59)
    ('date_order:second_number', '=', 0),      # Second (0-59)
]

# Time granularity for read_group
result = self.read_group(
    [('create_date', '>=', fields.DateTime.now())],
    ['amount:sum'],
    ['create_date:day']       # Truncate to day
    # Other options: hour, week, month, quarter, year
)
```

**Supported Date Granularities**:

| Granularity | Type | Use Case |
|-------------|------|----------|
| `year_number` | Integer | Year number (2024, 2025, ...) |
| `quarter_number` | Integer | Quarter number (1-4) |
| `month_number` | Integer | Month number (1-12) |
| `iso_week_number` | Integer | ISO week number (1-53) |
| `day_of_year` | Integer | Day of year (1-366) |
| `day_of_month` | Integer | Day of month (1-31) |
| `day_of_week` | Integer | Day of week (0=Mon, 6=Sun) |
| `hour_number` | Integer | Hour (0-23) |
| `minute_number` | Integer | Minute (0-59) |
| `second_number` | Integer | Second (0-59) |

**Note**: For `read_group`, you can use `day`, `week`, `month`, `quarter`, `year`, `hour` which truncate the date to that granularity.

---

## Environment Context

### with_context() - Modify Context

```python
# Change language
records.with_context(lang='fr_FR').name

# Disable active_test for archiving
all_records = self.with_context(active_test=False).search([])

# Bin size for binary fields
attachments.with_context(bin_size=True).read(['datas'])

# Company context
records.with_context(allowed_company_ids=[1, 2])

# Timezone
records.with_context(tz='Asia/Ho_Chi_Minh')

# Custom context key
records.with_context(from_batch=True).action_process()
```

### with_user() - Change User

```python
# Run as different user
records.with_user(user_id).write({'notes': 'Admin note'})

# Run as superuser (use sparingly)
records.sudo().write({'notes': 'System note'})
```

### with_company() - Change Company

```python
# Set specific company
records.with_company(company_id).read(['amount'])

# In multi-company context
records.with_company(main_company).action_process()
```

---

## Environment Methods (Odoo 18)

### New SQL Query Methods (Odoo 18)

```python
from odoo.tools import SQL

# execute_query_dict - returns list of dicts, auto-flushes
query = SQL("""
    SELECT id, name, amount
    FROM sale_order
    WHERE state = %s
""", 'done')

results = self.env.execute_query_dict(query)
# Returns: [{'id': 1, 'name': 'SO001', 'amount': 100.0}, ...]

# execute_query - returns list of tuples, auto-flushes
results = self.env.execute_query(query)
# Returns: [(1, 'SO001', 100.0), ...]
```

### Environment Check Methods (Odoo 18)

```python
# Check if in superuser mode
if self.env.is_superuser():
    # Running as superuser (sudo mode)
    pass

# Check if current user is admin (has "Access Rights" group)
if self.env.is_admin():
    # User has admin rights
    pass

# Check if current user has system settings rights
if self.env.is_system():
    # User can access settings
    pass
```

### Environment Properties (Odoo 18)

```python
# Get current user (as record, sudoed)
user = self.env.user

# Get current company
company = self.env.company

# Get enabled companies (recordset)
companies = self.env.companies

# Get current language
lang = self.env.lang

# Get translation method
translated = self.env._("Hello World")
```

### flush_query (Odoo 18)

```python
from odoo.tools import SQL

# Flush specific fields before query
query = SQL("SELECT ...")
query.to_flush = [self._fields['amount']]  # Mark fields to flush
self.env.flush_query(query)
self.env.cr.execute(query)
```

---

## Recordset Utility Methods (Odoo 18)

### mapped() - Extract Field Values

Apply function or get field values from all records.

```python
# Get field values as list
names = records.mapped('name')        # ['A', 'B', 'C']
partner_ids = records.mapped('partner_id')  # recordset of partners

# Nested path - returns union of related records
banks = records.mapped('partner_id.bank_ids')  # recordset, duplicates removed

# With lambda function
amounts = records.mapped(lambda r: r.amount_total * 1.1)

# Multi-level dotted path
emails = records.mapped('partner_id.email')
```

### filtered() - Filter Records

Return records satisfying a condition.

```python
# With lambda
done_orders = orders.filtered(lambda r: r.state == 'done')

# With field name (short syntax)
companies = records.filtered('partner_id.is_company')

# With dotted path - checks if ANY related record satisfies
# records.filtered("partner_id.bank_ids")  # True if has any banks
```

### filtered_domain() - Filter by Domain (Odoo 18)

Filter records by domain while keeping order.

```python
# Filter by domain (keeps original order)
done_orders = orders.filtered_domain([('state', '=', 'done')])

# Complex domain
urgent = orders.filtered_domain([
    '&',
    ('state', '=', 'draft'),
    '|',
    ('priority', '=', '2'),
    ('date', '<', fields.Date.today()),
])
```

### grouped() - Group Records (Odoo 18)

Group records by key without aggregation overhead.

```python
# Group by field name
groups = records.grouped('state')
# Returns: {'draft': recordset1, 'done': recordset2, ...}

# Group by callable
groups = records.grouped(lambda r: r.company_id)

# Process groups
for company, company_records in groups.items():
    print(f"{company.name}: {len(company_records)} records")

# All recordsets share the same prefetch set for efficiency
```

**Note**: Unlike `itertools.groupby`, `grouped()` doesn't require pre-sorting.

### sorted() - Sort Records

Return records sorted by key.

```python
# Sort by field name
sorted_records = records.sorted('name')

# Sort by lambda
sorted_records = records.sorted(key=lambda r: r.amount_total)

# Reverse sort
sorted_records = records.sorted(key=lambda r: r.amount_total, reverse=True)

# Sort by model default order (if key=None)
sorted_records = records.sorted()  # Uses model's _order
```

### Method Comparison

| Method | Returns | Use Case |
|--------|---------|----------|
| `mapped()` | list or recordset | Extract values from all records |
| `filtered()` | recordset | Keep records matching condition |
| `filtered_domain()` | recordset | Filter by domain (keeps order) |
| `grouped()` | dict | Group by key (no aggregation) |
| `sorted()` | recordset | Sort records by key |

---

## Recordset Iteration Patterns

### GOOD: Batch Field Access

```python
# GOOD: Fields are prefetched automatically
for order in orders:
    print(order.name, order.amount, order.partner_id.name)
# Only 2 queries: one for orders, one for all partners

# GOOD: Access related recordset
for order in orders:
    for line in order.line_ids:
        print(line.product_id.name)
# Lines and products are prefetched
```

### BAD: N+1 Query Pattern

```python
# BAD: search inside loop
for order in orders:
    partner = self.env['res.partner'].browse(order.partner_id.id)
    print(partner.name)  # New query each iteration

# BAD: Access field that triggers search
for order in orders:
    print(order.message_ids[0].author_id.name)  # New query each time

# GOOD: Pre-fetch messages
orders.read(['message_ids'])  # or use with prefetch
for order in orders:
    if order.message_ids:
        print(order.message_ids[0].author_id.name)
```

---

## Common Patterns

### Check if Recordset is Empty

```python
# GOOD: Use boolean context
if not records:
    return {}

# GOOD: Check length
if len(records) == 0:
    return {}

# BAD: Don't use .exists() for empty check
if not records.exists():  # This is wrong - empty.exists() is empty
    return {}
```

### Ensure Records Exist

```python
# GOOD: Filter out non-existing records
valid_records = records.exists()

# GOOD: Raise error if missing
if not records.exists():
    raise MissingError(_('Record not found'))
```

### Get Single Record

```python
# GOOD: Ensure single record
records = self.search([('code', '=', 'ABC')], limit=1)
if not records:
    raise UserError(_('No record found'))

# GOOD: Use ensure_one()
records = self.search([('code', '=', 'ABC')])
records.ensure_one()
```

### Sorted Recordsets

```python
# Sorted by field (in memory, not efficient for large sets)
sorted_records = records.sorted(key=lambda r: r.date, reverse=True)

# Sorted by default model order
sorted_records = records.sorted()

# Use database order instead
records = self.search(domain, order='date DESC')
```

---

## Advanced Model Attributes (Odoo 18)

### _check_company_auto - Automatic Company Consistency

```python
class MyModel(models.Model):
    _name = 'my.model'
    _check_company_auto = True

    company_id = fields.Many2one('res.company', required=True)
    partner_id = fields.Many2one(
        'res.partner',
        check_company=True  # Will be validated automatically
    )
```

**Behavior**:
- Automatically calls `_check_company()` on `create()` and `write()`
- Ensures relational fields with `check_company=True` have consistent companies
- Prevents records from linking to companies incompatible with their own company
- Use in multi-company environments to maintain data integrity

### _parent_store - Hierarchical Tree Optimization

```python
class Category(models.Model):
    _name = 'my.category'
    _parent_name = 'parent_id'  # Many2one field to use as parent
    _parent_store = True  # Enable parent_path computation

    name = fields.Char(required=True)
    parent_id = fields.Many2one('my.category', string='Parent Category')
    parent_path = fields.Char(index=True)  # Computed automatically
```

**Behavior**:
- Computes and stores `parent_path` field for efficient tree queries
- Enables fast `child_of` and `parent_of` domain operators
- Automatically maintained when records are created/updated
- Use for hierarchical models (categories, forums, org structures)
- Requires `parent_path` field with `index=True`

**Benefits**:
- Tree queries are much faster with `parent_path` than recursive queries
- No need for recursive SQL queries
- `child_of` and `parent_of` operators become efficient

**Note**: `_parent_store` requires a properly configured `parent_id` field and `parent_path` field.

### Model Attribute Reference

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `_check_company_auto` | bool | `False` | Auto-check company consistency on write/create |
| `_parent_name` | str | `'parent_id'` | Field to use as parent in hierarchy |
| `_parent_store` | bool | `False` | Enable parent_path for fast tree queries |
| `_fold_name` | str | `'fold'` | Field to determine folded groups in kanban |
| `_order` | str | `'id'` | Default order for search results |
| `_rec_name` | str | `'name'` | Field to use for display name |
| `_sequence` | int | auto | Sequence number for model ordering |
| `_register` | bool | `False` | Registry visibility (set to False for abstract classes) |


---

---
name: odoo-18-owl
description: Complete reference for Odoo 18 OWL (Owl Web Library) components, hooks, services, and patterns for building interactive JavaScript UI components.
globs: "**/static/src/**/*.js"
topics:
  - OWL basics (Component, setup, template, props, state)
  - OWL hooks (useState, useEffect, onMounted, onWillUnmount, useRef, useService)
  - Odoo components (Dropdown, SelectMenu, TagsList, Notebook, Pager, CheckBox, ColorList, ActionSwiper)
  - Services (rpc, dialog, notification, ui, action, router)
  - QWeb templates and directives
  - Registries (category, add, get, contains)
  - Assets and module structure
when_to_use:
  - Creating custom UI components
  - Building views and widgets
  - Implementing client actions
  - Creating frontend interactions
  - Extending existing components
---

# Odoo 18 OWL Guide

Complete reference for Odoo 18 OWL (Owl Web Library) components, hooks, services, and patterns for building interactive JavaScript UI components.

## Table of Contents

1. [OWL Basics](#owl-basics)
2. [Component Lifecycle](#component-lifecycle)
3. [OWL Hooks](#owl-hooks)
4. [Odoo Core Components](#odoo-core-components)
5. [Services](#services)
6. [QWeb Templates](#qweb-templates)
7. [Registries](#registries)
8. [RPC and Data](#rpc-and-data)
9. [Common Patterns](#common-patterns)
10. [Best Practices](#best-practices)

---

## OWL Basics

### Import OWL from @odoo/owl

```javascript
import {
    Component,
    xml,
    useState,
    useEffect,
    onMounted,
    onWillUnmount,
    useRef,
    useSubEnv
} from "@odoo/owl";
```

### Basic Component Structure

```javascript
import { Component, xml, useState } from "@odoo/owl";

export class MyComponent extends Component {
    // Static properties define component metadata
    static template = xml`
        <div class="my-component" t-on-click="increment">
            <span t-esc="state.value"/>
        </div>
    `;

    static components = {}; // Child components

    static props = {
        value: { type: Number, optional: true },
        onValueChange: { type: Function, optional: true },
    };

    static defaultProps = {
        value: 0,
    };

    // setup() is called once when component is created
    setup() {
        this.state = useState({ value: this.props.value || 0 });
    }

    increment() {
        this.state.value++;
        if (this.props.onValueChange) {
            this.props.onValueChange(this.state.value);
        }
    }
}
```

### Template in XML File (Recommended)

**JavaScript file (`my_component.js`)**:
```javascript
import { Component, useState } from "@odoo/owl";

export class MyComponent extends Component {
    static template = "myaddon.MyComponent";
    static props = ["*"];

    setup() {
        this.state = useState({ count: 0 });
    }

    increment() {
        this.state.count++;
    }
}
```

**XML template file (`my_component.xml`)**:
```xml
<?xml version="1.0" encoding="UTF-8" ?>
<templates xml:space="preserve">
    <t t-name="myaddon.MyComponent">
        <div class="my-component">
            <button t-on-click="increment">
                Count: <t t-esc="state.count"/>
            </button>
        </div>
    </t>
</templates>
```

**Important**: Template names should follow the convention `addon_name.ComponentName`.

### File Structure

A typical OWL component in Odoo should have these files in the same directory:

```
static/src/views/my_module/
├── my_component.js       # Component logic
├── my_component.xml      # QWeb template
└── my_component.scss     # Styles (optional)
```

Add to assets bundle in `__manifest__.py`:

```python
'assets': {
    'web.assets_backend': [
        'my_module/static/src/views/my_module/**/*.js',
        'my_module/static/src/views/my_module/**/*.xml',
        'my_module/static/src/views/my_module/**/*.scss',
    ],
}
```

---

## Component Lifecycle

### Lifecycle Order

```javascript
import {
    Component,
    setup,
    onMounted,
    onWillStart,
    onWillUnmount,
    onWillUpdateProps,
    onWillPatch,
    onPatched,
    onRendered
} from "@odoo/owl";

class LifecycleDemo extends Component {
    setup() {
        // 1. Called first - component initialization
        console.log("setup");

        // 2. Called before first render
        onWillStart(() => {
            console.log("onWillStart");
            // Async setup: load data, start services
            return this.loadData();
        });

        // 3. Called after DOM is mounted
        onMounted(() => {
            console.log("onMounted");
            // DOM access, animations, third-party libs
        });

        // 4. Called before props update
        onWillUpdateProps((nextProps) => {
            console.log("onWillUpdateProps", nextProps);
        });

        // 5. Called before DOM patch
        onWillPatch(() => {
            console.log("onWillPatch");
        });

        // 6. Called after DOM patch
        onPatched(() => {
            console.log("onPatched");
        });

        // 7. Called after each render
        onRendered(() => {
            console.log("onRendered");
        });

        // 8. Called before component unmount
        onWillUnmount(() => {
            console.log("onWillUnmount");
            // Cleanup: remove listeners, cancel timers
        });
    }
}
```

### Setup Method (Best Practice)

**Always use `setup()` instead of `constructor`**:

```javascript
// CORRECT
class GoodComponent extends Component {
    setup() {
        this.state = useState({ value: 1 });
    }
}

// INCORRECT - Do not use constructor
class BadComponent extends Component {
    constructor(parent, props) {
        super(parent, props);
        this.state = useState({ value: 1 });
    }
}
```

**Why**: `setup()` is overridable, constructor is not. Odoo needs to extend component behavior.

---

## OWL Hooks

### useState - Reactive State

```javascript
import { useState } from "@odoo/owl";

setup() {
    // Simple state
    this.state = useState({
        count: 0,
        name: "Test"
    });

    // Nested state
    this.state = useState({
        user: {
            name: "John",
            email: "john@example.com"
        },
        settings: {
            theme: "dark"
        }
    });

    // Access and modify
    this.state.count++;      // Triggers re-render
    this.state.user.name = "Jane";  // Also reactive
}
```

### useEffect - Side Effects

```javascript
import { useEffect, useState } from "@odoo/owl";

setup() {
    this.state = useState({ count: 0 });

    // Run when count changes
    useEffect(
        () => {
            document.title = `Count: ${this.state.count}`;
        },
        () => [this.state.count]  // Dependency function
    );

    // Cleanup on unmount or dependency change
    useEffect(
        () => {
            const timer = setInterval(() => {
                console.log("tick");
            }, 1000);
            return () => clearInterval(timer);
        },
        () => []
    );
}
```

### useRef - DOM References

```javascript
import { useRef, onMounted } from "@odoo/owl";

setup() {
    this.inputRef = useRef("inputRef");

    onMounted(() => {
        // Access DOM element
        this.inputRef.el.focus();
        this.inputRef.el.value = "Hello";
    });
}

// In template:
// <input t-ref="inputRef" />
```

### useService - Access Odoo Services

```javascript
import { useService } from "@web/core/utils/hooks";

setup() {
    // RPC service - call Python methods
    this.rpc = useService("rpc");

    // Dialog service - show modals
    this.dialog = useService("dialog");

    // Notification service - show toasts
    this.notification = useService("notification");

    // Router service - navigation
    this.router = useService("router");

    // Action service - execute Odoo actions
    this.action = useService("action");

    // UI service - UI state
    this.ui = useService("ui");

    // ORM service - database operations
    this.orm = useService("orm");
}
```

### useSubEnv - Nested Environment

```javascript
import { useSubEnv } from "@odoo/owl";

setup() {
    // Override environment for child components
    useSubEnv({
        customProp: "value",
        model: this.props.record.model,
    });
}
```

---

## Odoo Core Components

### Dropdown - Full-Featured Dropdown

```javascript
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

static components = { Dropdown, DropdownItem };

static template = xml`
    <Dropdown>
        <button class="btn btn-primary">Options</button>
        <t t-set-slot="content">
            <DropdownItem onSelected="() => this.doAction('edit')">
                Edit
            </DropdownItem>
            <DropdownItem onSelected="() => this.doAction('delete')">
                Delete
            </DropdownItem>
            <DropdownItem onSelected="() => this.doAction('archive')" closingMode="'none'">
                Archive (keep open)
            </DropdownItem>
        </t>
    </Dropdown>
`;
```

**Nested Dropdown**:
```xml
<Dropdown>
    <button>File</button>
    <t t-set-slot="content">
        <DropdownItem onSelected="save">Save</DropdownItem>
        <Dropdown>
            <button>New</button>
            <t t-set-slot="content">
                <DropdownItem onSelected="newDocument">Document</DropdownItem>
                <DropdownItem onSelected="newSpreadsheet">Spreadsheet</DropdownItem>
            </t>
        </Dropdown>
    </t>
</Dropdown>
```

**Dropdown Props**:
| Prop | Type | Description |
|------|------|-------------|
| `menuClass` | `String` | Optional classname for menu |
| `disabled` | `Boolean` | Disable dropdown |
| `position` | `String` | Menu position (default: `bottom-start`) |
| `beforeOpen` | `Function` | Called before opening (async ok) |
| `onOpened` | `Function` | Called after opening |
| `manual` | `Boolean` | Don't add click handlers (use with `state`) |

### SelectMenu - Enhanced Select

```javascript
import { SelectMenu } from "@web/core/select_menu/select_menu";

static components = { SelectMenu };

static template = xml`
    <SelectMenu
        choices="choices"
        value="state.selectedValue"
        onSelect="onSelect"
        searchable="true"
    />
`;

get choices() {
    return [
        { value: "1", label: "Option 1" },
        { value: "2", label: "Option 2" },
        { value: "3", label: "Option 3" },
    ];
}

onSelect(value) {
    this.state.selectedValue = value;
}
```

**Multi-Select with Groups**:
```xml
<SelectMenu
    choices="choices"
    groups="groups"
    multiSelect="true"
    value="state.selectedValues"
>
    <span>Select items</span>
    <t t-set-slot="choice" t-slot-scope="choice">
        <span t-esc="'👉 ' + choice.data.label + ' 👈'" />
    </t>
</SelectMenu>
```

**SelectMenu Props**:
| Prop | Type | Description |
|------|------|-------------|
| `choices` | `Array` | List of `{value, label}` |
| `groups` | `Array` | Grouped choices |
| `multiSelect` | `Boolean` | Enable multiple selection |
| `searchable` | `Boolean` | Show search box |
| `value` | `any` | Selected value(s) |
| `onSelect` | `Function` | Callback on selection |

### TagsList - Display Tags

```javascript
import { TagsList } from "@web/core/tags_list/tags_list";

static template = xml`
    <TagsList tags="state.tags" />
`;

get state() {
    return {
        tags: [
            { id: "tag1", text: "Earth", colorIndex: 1 },
            {
                id: "tag2",
                text: "Wind",
                colorIndex: 2,
                onDelete: () => this.deleteTag("tag2")
            },
            {
                id: "tag3",
                text: "Fire",
                icon: "fa-fire",
                onClick: () => this.clickTag("tag3"),
                onDelete: () => this.deleteTag("tag3")
            },
        ]
    };
}
```

**Color IDs**: 0 (No color), 1 (Red), 2 (Orange), 3 (Yellow), 4 (Light blue), 5 (Dark purple), 6 (Salmon pink), 7 (Medium blue), 8 (Dark blue), 9 (Fuchsia), 11 (Purple), 12 (Green)

### Notebook - Tabbed Interface

```javascript
import { Notebook } from "@web/core/notebook/notebook";

static template = xml`
    <Notebook orientation="'vertical'" defaultPage="'page_2'">
        <t t-set-slot="page_1" title="'First Page'" isVisible="true">
            <h1>Page 1 Content</h1>
        </t>
        <t t-set-slot="page_2" title="'Second Page'" isVisible="true">
            <p>Page 2 Content</p>
        </t>
    </Notebook>
`;
```

**Programmatic Pages**:
```javascript
get pages() {
    return [
        {
            Component: MyTemplateComponent,
            id: "page_1",
            title: "Page 1",
            props: { title: "My First Page" },
            isDisabled: false,
        },
        {
            Component: MyTemplateComponent,
            id: "page_2",
            title: "Page 2",
            props: { title: "My Second Page" },
        },
    ];
}
```

### Pager - Pagination

```javascript
import { Pager } from "@web/core/pager/pager";

static template = xml`
    <Pager
        offset="state.offset"
        limit="state.limit"
        total="state.total"
        onUpdate="onPageUpdate"
    />
`;

setup() {
    this.state = useState({
        offset: 0,
        limit: 80,
        total: 200,
    });
}

onPageDownload({ offset, limit }) {
    this.state.offset = offset;
    this.state.limit = limit;
    this.loadRecords();
}
```

**Display**: "1-80 / 200" (offset is 0-based, displayed as 1-based)

### CheckBox - Simple Checkbox

```javascript
import { CheckBox } from "@web/core/checkbox/checkbox";

static template = xml`
    <CheckBox
        value="state.isChecked"
        disabled="state.isDisabled"
        t-on-change="onCheckboxChange"
    >
        Agree to terms
    </CheckBox>
`;
```

### ColorList - Color Picker

```javascript
import { ColorList } from "@web/core/colorlist/colorlist";

static template = xml`
    <ColorList
        colors="state.availableColors"
        selectedColor="state.selectedColorId"
        onColorSelected="onColorSelected"
        canToggle="true"
    />
`;
```

### ActionSwiper - Touch Swipe Actions

```javascript
import { ActionSwiper } from "@web/core/action_swiper/action_swiper";

static template = xml`
    <ActionSwiper
        onLeftSwipe="swipeLeftAction"
        onRightSwipe="swipeRightAction"
        swipeDistanceRatio="0.3"
    >
        <div>Swipeable item</div>
    </ActionSwiper>
`;

get swipeLeftAction() {
    return {
        action: () => this.deleteItem(),
        icon: 'fa-delete',
        bgColor: 'bg-danger',
    };
}

get swipeRightAction() {
    return {
        action: () => this.starItem(),
        icon: 'fa-star',
        bgColor: 'bg-warning',
    };
}
```

---

## Services

### RPC Service - Call Python Methods

```javascript
this.rpc = useService("rpc");

// Simple call
const result = await this.rpc("/my/controller/endpoint", { arg1: "value" });

// Model method call
const partners = await this.rpc({
    model: "res.partner",
    method: "search_read",
    args: [[["is_company", "=", true]]],
    kwargs: { fields: ["name", "email"] },
});

// Named route with params
const data = await this.rpc("/web/dataset/call_kw", {
    model: "sale.order",
    method: "action_confirm",
    args: [[orderId]],
});
```

### ORM Service - Database Operations

```javascript
this.orm = useService("orm");

// Read records
const records = await this.orm.searchRead(
    "res.partner",
    [["customer_rank", ">", 0]],
    ["name", "email", "phone"]
);

// Create record
const id = await this.orm.create("res.partner", [{
    name: "New Partner",
    email: "test@example.com",
}]);

// Write records
await this.orm.write("res.partner", [id], {
    phone: "123456"
});

// Unlink records
await this.orm.unlink("res.partner", [id]);

// Call method
const result = await this.orm.call("res.partner", "name_get", [[id]]);

// Read group
const groups = await this.orm.readGroup(
    "sale.order",
    [["state", "!=", "draft"]],
    ["state", "amount_total:sum"],
    ["state"]
);
```

### Dialog Service - Show Modals

```javascript
this.dialog = useService("dialog");

// Simple dialog
this.dialog.add(MyDialogComponent, {
    title: "Confirmation",
    message: "Are you sure?",
    confirm: () => this.doAction(),
});

// Confirm dialog
this.dialog.add(ConfirmationDialog, {
    title: this.env._t("Delete Record"),
    body: this.env._t("Are you sure you want to delete this record?"),
    confirm: async () => {
        await this.orm.unlink(this.props.resModel, [this.props.resId]);
        this.props.close();
    },
    cancel: () => {},
});
```

### Notification Service - Toast Messages

```javascript
this.notification = useService("notification");

// Simple notification
this.notification.notify("Message sent!", { type: "success" });

// With options
this.notification.notify("Error occurred", {
    type: "danger",
    sticky: true,
    title: "Error",
});

// Types: success, info, warning, danger
```

### Action Service - Execute Odoo Actions

```javascript
this.action = useService("action");

// Execute window action
await this.action.doAction({
    name: "Partners",
    type: "ir.actions.act_window",
    res_model: "res.partner",
    view_mode: "tree,form",
    views: [[false, "list"], [false, "form"]],
    domain: [["customer_rank", ">", 0]],
});

// Open form
await this.action.doAction({
    type: "ir.actions.act_window",
    res_model: "res.partner",
    res_id: partnerId,
    views: [[false, "form"]],
    target: "new",  // or "current", "fullscreen"
});

// Reload current action
await this.action.reload();

// Back button
await this.action.doBack();
```

### Router Service - Navigation

```javascript
this.router = useService("router");

// Navigate to action
this.router.push({ action: 123 });

// Navigate with search domain
this.router.push({
    action: 123,
    view_type: "list",
    model: "sale.order",
    domain: '[["state", "=", "draft"]]',
});

// Get current state
const state = this.router.current;
```

### UI Service - UI State

```javascript
this.ui = useService("ui");

// Check if small screen (mobile)
const isSmall = this.ui.isSmall;

// Check if active element
const isActive = this.ui.isActiveElement(element);

// Block/Unblock UI
this.ui.block();
try {
    await someOperation();
} finally {
    this.ui.unblock();
}
```

### Registry Service

```javascript
this.registry = useService("registry");

// Get category
const viewRegistry = registry.category("views");

// Add to registry
viewRegistry.add("my_view", {
    ...myViewDefinition,
});

// Get from registry
const viewDef = viewRegistry.get("my_view");

// Check existence
if (viewRegistry.contains("my_view")) {
    // ...
}

// Remove from registry
viewRegistry.remove("my_view");

// Get all
const allViews = viewRegistry.getAll();
```

---

## QWeb Templates

### Template Directives

```xml
<!-- Render value -->
<t t-esc="state.value" />

<!-- Render HTML (unsafe) -->
<t t-raw="state.htmlContent" />

<!-- Conditionals -->
<div t-if="state.isActive">Active</div>
<div t-elif="state.isPending">Pending</div>
<div t-else="">Inactive</div>

<!-- Loops -->
<t t-foreach="state.records" t-as="record" t-key="record.id">
    <span t-attf-class="record-{{record.id}}">
        <t t-esc="record.name" />
    </span>
</t>

<!-- Attributes -->
<input t-att-value="state.value" />
<input t-attf-placeholder="Search {{state.modelName}}" />
<div t-att-class="state.isActive ? 'active' : ''" />
<div t-att="{'data-id': record.id, 'data-name': record.name}" />

<!-- Event handlers -->
<button t-on-click="handleClick">Click</button>
<input t-on-input="onInput" />
<div t-on-mouseenter="onHover" />

<!-- Set variable -->
<t t-set="userName" t-value="record.name" />
<t t-foreach="items" t-as="item">
    <t t-set="index" t-value="index + 1" />
</t>

<!-- Call template -->
<t t-call="myaddon.OtherTemplate">
    <t t-set="customProp" t-value="'custom'" />
</t>

<!-- Debug -->
<t t-debug="state" />
```

### Inline XML Templates

```javascript
static template = xml`
    <div class="my-component">
        <h1 t-esc="props.title"/>
        <input
            t-model="state.searchText"
            t-on-input="onSearchInput"
            placeholder="Search..."
        />
        <ul>
            <li t-foreach="state.filteredItems" t-as="item" t-key="item.id">
                <span t-esc="item.name" />
                <button t-on-click="() => this.selectItem(item)">
                    Select
                </button>
            </li>
        </ul>
    </div>
`;
```

---

## Registries

### Using Registries

```javascript
import { registry } from "@web/core/registry";

// Get or create category
const viewRegistry = registry.category("views");
const fieldRegistry = registry.category("fields");
const actionRegistry = registry.category("actions");

// Add to registry
viewRegistry.add("my_custom_view", {
    type: "my_custom_view",
    display_name: "My Custom View",
    icon: "fa-star",
    isMobileFriendly: true,
    Controller: MyViewController,
    Renderer: MyViewRenderer,
    Model: MyViewModel,
});

// Get from registry
const viewDef = viewRegistry.get("my_custom_view");

// Check if contains
if (viewRegistry.contains("my_custom_view")) {
    console.log("View registered!");
}

// Add multiple
viewRegistry.add("view1", view1Def);
viewRegistry.add("view2", view2Def);

// Remove
viewRegistry.remove("view1");

// Get all
const allViews = viewRegistry.getAll();

// Add with validation
fieldRegistry.add("custom.field", {
    component: CustomField,
    supportedTypes: ["char", "text"],
    extractProps: (fieldInfo, props) => {
        return {
            maxLength: fieldInfo.rawAttrs.maxlength,
        };
    },
}, {
    // Validate
    component: (c) => c.prototype instanceof Component,
    supportedTypes: { type: Array, element: String },
});
```

---

## RPC and Data

### Common Data Patterns

```javascript
import { Component, useState, onWillStart } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class DataComponent extends Component {
    static template = "myaddon.DataComponent";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.rpc = useService("rpc");

        this.state = useState({
            records: [],
            isLoading: false,
            error: null,
        });

        onWillStart(this.onWillStart);
    }

    async onWillStart() {
        await this.loadRecords();
    }

    async loadRecords() {
        this.state.isLoading = true;
        this.state.error = null;

        try {
            this.state.records = await this.orm.searchRead(
                "res.partner",
                [["customer_rank", ">", 0]],
                ["name", "email", "phone"],
                { limit: 100 }
            );
        } catch (error) {
            this.state.error = error.message;
        } finally {
            this.state.isLoading = false;
        }
    }
}
```

### Custom RPC Methods

```javascript
// In Python controller
@http.route('/my/custom/endpoint', type='json', auth='user')
def custom_endpoint(self, **kwargs):
    records = request.env['my.model'].search_read(
        [('state', '=', 'active')],
        ['name', 'value']
    )
    return {
        'records': records,
        'count': len(records),
    }

// In JavaScript
async callCustomEndpoint() {
    const result = await this.rpc("/my/custom/endpoint", {
        search_domain: [["state", "=", "active"]],
    });
    this.state.records = result.records;
    this.state.count = result.count;
}
```

---

## Common Patterns

### Props Definition

```javascript
static props = {
    // Required prop
    record: Object,

    // Optional prop
    title: { type: String, optional: true },

    // Union type
    value: { type: [String, Number], optional: true },

    // Wildcard (accept any)
    custom: "*",

    // Array type
    items: {
        type: Array,
        element: Object,
        shape: {
            id: Number,
            name: String,
        },
    },

    // Function prop
    onUpdate: { type: Function, optional: true },
};

static defaultProps = {
    title: "Default Title",
    items: [],
};
```

### Slots

```javascript
// Parent component
static template = xml`
    <div class="parent">
        <h2>Default slot content:</h2>
        <div class="default-slot">
            <t t-slot="default" />
        </div>

        <h2>Named slot:</h2>
        <div class="header-slot">
            <t t-slot="header" />
        </div>

        <h2>Scoped slot:</h2>
        <div class="scoped-slot">
            <t t-slot="item" t-slot-scope="item">
                <span t-esc="item.data.name" />
            </t>
        </div>
    </div>
`;

// Child usage
static template = xml`
    <ParentComponent>
        <!-- Default slot -->
        <div>Default content</div>

        <!-- Named slot -->
        <t t-set-slot="header">
            <h1>Custom Header</h1>
        </t>

        <!-- Scoped slot -->
        <t t-set-slot="item" t-slot-scope="item">
            <span>👉 <t t-esc="item.data.name" /> 👈</span>
        </t>
    </ParentComponent>
`;
```

### Event Handling

```javascript
// Template
static template = xml`
    <div>
        <button t-on-click="handleClick">Click</button>
        <input t-on-input="onInput" />
        <form t-on-submit="onSubmit">
            <button type="submit">Submit</button>
        </form>
    </div>
`;

// Handlers
handleClick(ev) {
    console.log("Clicked!", ev.target);
    ev.stopPropagation();
}

onInput(ev) {
    const value = ev.target.value;
    this.state.searchTerm = value;
}

async onSubmit(ev) {
    ev.preventDefault();
    await this.save();
}
```

### Environment Access

```javascript
setup() {
    // Access env props
    this.model = this.env.model;
    this.resModel = this.env.resModel;
    this.resId = this.env.resId;

    // Translation
    const _t = this.env._t;
    this.message = _t("Hello World");

    // Provide to children
    useSubEnv({
        customProp: "value",
        parentComponent: this,
    });
}
```

---

## Best Practices

### DO ✓

1. **Use `setup()` instead of `constructor`**
   ```javascript
   setup() {
       this.state = useState({ value: 1 });
   }
   ```

2. **Define templates in XML files**
   ```javascript
   static template = "myaddon.MyComponent";
   ```

3. **Use proper template naming**
   ```javascript
   // Convention: addon_name.ComponentName
   static template = "myaddon.MyComponent";
   ```

4. **Define props explicitly**
   ```javascript
   static props = {
       record: Object,
       title: { type: String, optional: true },
   };
   ```

5. **Clean up in `onWillUnmount`**
   ```javascript
   onWillUnmount(() => {
       this.observer.disconnect();
       clearInterval(this.timer);
   });
   ```

6. **Use services for cross-cutting concerns**
   ```javascript
   this.rpc = useService("rpc");
   this.orm = useService("orm");
   this.dialog = useService("dialog");
   ```

7. **Prefer native HTML elements when possible**
   ```javascript
   // Use native select for simple cases
   <select t-model="state.value">
       <option value="1">Option 1</option>
   </select>
   ```

### DON'T ✗

1. **Don't use `constructor`**
   ```javascript
   // BAD
   constructor(parent, props) {
       super(parent, props);
   }
   ```

2. **Don't inline templates for production**
   ```javascript
   // BAD (except for simple components)
   static template = xml`<div>...</div>`;
   ```

4. **Don't use `*` for props unless necessary**
   ```javascript
   // BAD - use explicit props
   static props = ["*"];
   ```

5. **Don't forget cleanup**
   ```javascript
   // BAD - memory leak
   setup() {
       this.timer = setInterval(() => {}, 1000);
   }
   ```

6. **Don't manipulate DOM directly**
   ```javascript
   // BAD
   setup() {
       document.querySelector(".my-element").style.display = "none";
   }

   // GOOD - use refs and lifecycle
   onMounted(() => {
       if (this.myRef.el) {
           this.myRef.el.style.display = "none";
       }
   });
   ```

---

## Complete Component Example

```javascript
/** @odoo-module **/
import { Component, xml, useState, onMounted, useRef, onWillUnmount } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { TagsList } from "@web/core/tags_list/tags_list";

export class PartnerList extends Component {
    static template = "myaddon.PartnerList";
    static components = { Dropdown, DropdownItem, TagsList };

    static props = {
        domain: { type: Array, optional: true },
        limit: { type: Number, optional: true },
    };

    static defaultProps = {
        domain: [],
        limit: 80,
    };

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");

        this.state = useState({
            partners: [],
            selectedPartners: new Set(),
            isLoading: false,
            searchValue: "",
        });

        this.rootRef = useRef("root");

        onMounted(() => this.loadPartners());
    }

    get filteredPartners() {
        if (!this.state.searchValue) {
            return this.state.partners;
        }
        const search = this.state.searchValue.toLowerCase();
        return this.state.partners.filter(p =>
            p.name.toLowerCase().includes(search)
        );
    }

    get tags() {
        return Array.from(this.state.selectedPartners).map(id => {
            const partner = this.state.partners.find(p => p.id === id);
            return {
                id: id.toString(),
                text: partner ? partner.name : `#${id}`,
                colorIndex: 1,
                onDelete: () => this.togglePartner(id),
            };
        });
    }

    async loadPartners() {
        this.state.isLoading = true;
        try {
            this.state.partners = await this.orm.searchRead(
                "res.partner",
                this.props.domain,
                ["name", "email", "phone"],
                { limit: this.props.limit }
            );
        } catch (error) {
            this.notification.notify("Failed to load partners", { type: "danger" });
        } finally {
            this.state.isLoading = false;
        }
    }

    togglePartner(id) {
        if (this.state.selectedPartners.has(id)) {
            this.state.selectedPartners.delete(id);
        } else {
            this.state.selectedPartners.add(id);
        }
        // Trigger reactivity
        this.state.selectedPartners = new Set(this.state.selectedPartners);
    }

    onSearchInput(ev) {
        this.state.searchValue = ev.target.value;
    }

    async doAction(action) {
        const ids = Array.from(this.state.selectedPartners);
        if (!ids.length) {
            this.notification.notify("No partners selected", { type: "warning" });
            return;
        }

        try {
            if (action === "archive") {
                await this.orm.write("res.partner", ids, { active: false });
                this.notification.notify(`${ids.length} partners archived`, { type: "success" });
            } else if (action === "delete") {
                await this.orm.unlink("res.partner", ids);
                this.notification.notify(`${ids.length} partners deleted`, { type: "success" });
            }
            this.state.selectedPartners = new Set();
            await this.loadPartners();
        } catch (error) {
            this.notification.notify("Action failed", { type: "danger" });
        }
    }
}
```

**XML Template (`partner_list.xml`)**:
```xml
<?xml version="1.0" encoding="UTF-8" ?>
<templates xml:space="preserve">
    <t t-name="myaddon.PartnerList">
        <div class="partner-list" t-ref="root">
            <!-- Tags for selected partners -->
            <TagsList tags="tags" />

            <!-- Search and actions -->
            <div class="d-flex justify-content-between mb-3">
                <input
                    type="text"
                    class="form-control"
                    placeholder="Search partners..."
                    t-model="state.searchValue"
                    t-on-input="onSearchInput"
                />
                <Dropdown>
                    <button class="btn btn-primary">Actions</button>
                    <t t-set-slot="content">
                        <DropdownItem onSelected="() => this.doAction('archive')">
                            Archive
                        </DropdownItem>
                        <DropdownItem onSelected="() => this.doAction('delete')">
                            Delete
                        </DropdownItem>
                    </t>
                </Dropdown>
            </div>

            <!-- Loading state -->
            <div t-if="state.isLoading" class="text-center">
                <i class="fa fa-spinner fa-spin" />
            </div>

            <!-- Partner list -->
            <div class="list-group">
                <t t-foreach="filteredPartners" t-as="partner" t-key="partner.id">
                    <div
                        class="list-group-item d-flex justify-content-between align-items-center"
                        t-att-class="state.selectedPartners.has(partner.id) ? 'active' : ''"
                        t-on-click="() => this.togglePartner(partner.id)"
                    >
                        <div>
                            <strong t-esc="partner.name" />
                            <div t-if="partner.email" class="text-muted">
                                <t t-esc="partner.email" />
                            </div>
                        </div>
                        <i class="fa fa-check" t-if="state.selectedPartners.has(partner.id)" />
                    </div>
                </t>
            </div>
        </div>
    </t>
</templates>
```

---

## Key Takeaways

1. **Always use `setup()` method** instead of `constructor` for initialization
2. **Templates should be in XML files** following `addon_name.ComponentName` convention
3. **Use hooks for reactivity**: `useState`, `useEffect`, `useRef`, `useService`
4. **Leverage Odoo services**: `rpc`, `orm`, `dialog`, `notification`, `action`
5. **Use core components**: `Dropdown`, `SelectMenu`, `TagsList`, `Notebook`, `Pager`
6. **Define props explicitly** with proper types and optional flags
7. **Clean up resources** in `onWillUnmount`
8. **Prefer native elements** over complex components when possible


---

---
name: odoo-18-performance
description: Complete guide for writing performant Odoo 18 code, focusing on N+1 query prevention, batch operations, and optimization patterns.
globs: "**/*.{py,xml}"
topics:
  - Prefetch mechanism (how it works, understanding groups)
  - N+1 query prevention patterns
  - Batch operations (create, write, unlink)
  - Field selection optimization (search_read, load, bin_size)
  - Aggregation optimization (_read_group core method, read_group for UI)
  - Compute field optimization (store, precompute, avoiding recursion)
  - SQL optimization (when to use, execute_query, SQL class)
  - Clean code patterns (mapped, filtered, sorted)
when_to_use:
  - Optimizing slow code
  - Preventing N+1 queries
  - Writing batch operations
  - Optimizing computed fields
  - Using _read_group() for aggregations
  - Using direct SQL for aggregations
---

# Odoo 18 Performance Guide

Complete guide for writing performant Odoo 18 code, focusing on N+1 query prevention and clean patterns.

## Table of Contents

1. [Prefetch Mechanism](#prefetch-mechanism)
2. [N+1 Query Prevention](#n1-query-prevention)
3. [Batch Operations](#batch-operations)
4. [Field Selection Optimization](#field-selection-optimization)
5. [Compute Field Optimization](#compute-field-optimization)
6. [SQL Optimization](#sql-optimization)

---

## Prefetch Mechanism

### How Prefetch Works

Odoo automatically prefetches records in batches to minimize queries.

```python
# Constants from Odoo base
PREFETCH_MAX = 1000  # Maximum records prefetched per batch
INSERT_BATCH_SIZE = 100
UPDATE_BATCH_SIZE = 100
```

**How it works**:
1. When you access a field on a recordset, Odoo loads that field for ALL records in the recordset
2. This happens per model, not per relation
3. Related records are also prefetched up to `PREFETCH_MAX`

```python
# GOOD: Automatic prefetch
orders = self.search([('state', '=', 'done')])  # 1 query for orders
for order in orders:
    print(order.name)  # 1 query for all names
    print(order.partner_id.name)  # 1 query for all partners
# Total: 3 queries regardless of number of orders
```

### Understanding Prefetch Groups

```python
# Orders with same partner_id - partner fetched once
orders = self.search([('partner_id', '=', partner_id)])
for order in orders:
    print(order.partner_id.name)  # 1 query for all orders

# Orders with different partners - partners fetched in batch
orders = self.search([])  # Many different partners
for order in orders:
    print(order.partner_id.name)  # Queries in batches of 1000
```

---

## N+1 Query Prevention

### Pattern 1: Search Inside Loop (BAD)

```python
# BAD: N+1 query
for order in orders:
    payments = self.env['payment.transaction'].search([
        ('order_id', '=', order.id)
    ])
    order.payment_count = len(payments)
# Result: 1 + N queries

# GOOD: Use read_group or search with IN domain
order_ids = orders.ids
all_payments = self.env['payment.transaction'].search_read(
    [('order_id', 'in', order_ids)],
    ['order_id']
)
# Count by order
from collections import defaultdict
payment_counts = defaultdict(int)
for payment in all_payments:
    payment_counts[payment['order_id'][0]] += 1

for order in orders:
    order.payment_count = payment_counts.get(order.id, 0)
# Result: 1 query
```

### Pattern 2: One2many Traversal

```python
# GOOD: Use mapped() instead of loop
orders = self.search([('state', '=', 'done')])

# GOOD: Prefetch works automatically
for order in orders:
    for line in order.line_ids:
        print(line.product_id.name)
# Result: ~3 queries (orders, lines, products)

# BETTER: Preload with read() if you only need specific data
lines_data = orders.mapped('line_ids').read(['product_id', 'quantity'])
```

### Pattern 3: Computed Field with Related Access

```python
# BAD: Triggers query for each record
@api.depends('partner_id')
def _compute_partner_email(self):
    for order in self:
        order.partner_email = order.partner_id.email  # N queries

# GOOD: Add partner_id.email to depends
@api.depends('partner_id', 'partner_id.email')
def _compute_partner_email(self):
    for order in self:
        order.partner_email = order.partner_id.email  # 1 query prefetched
```

### Pattern 4: Conditional Computation

```python
# BAD: Check inside loop triggers queries
for order in orders:
    if order.partner_id.customer_rank > 0:
        order.is_customer = True
# Each access to partner_id.customer_rank triggers fetch

# GOOD: Use filtered()
customers = orders.filtered(lambda o: o.partner_id.customer_rank > 0)
customers.is_customer = True
```

---

## Batch Operations

### Batch Create (Odoo 18)

```python
# GOOD: Batch create (Odoo 18 standard)
records = self.create([
    {'name': f'Record {i}', 'state': 'draft'}
    for i in range(100)
])
# Single INSERT batch

# BAD: Create in loop
for i in range(100):
    self.create({'name': f'Record {i}'})
# 100 INSERT statements
```

### Batch Write

```python
# GOOD: Write on recordset
self.search([('state', '=', 'draft')]).write({'state': 'cancel'})
# Single UPDATE batch

# BAD: Write in loop
for order in self.search([('state', '=', 'draft')]):
    order.write({'state': 'cancel'})
# N UPDATE statements
```

### Batch Unlink

```python
# GOOD: Unlink recordset
self.search([('state', '=', 'cancel')]).unlink()
# Single DELETE batch

# BAD: Unlink in loop
for order in self.search([('state', '=', 'cancel')]):
    order.unlink()
# N DELETE statements
```

---

## Field Selection Optimization

### Use search_read for Specific Fields

```python
# GOOD: search_read when you need dicts, not recordsets
data = self.search_read(
    [('state', '=', 'done')],
    ['name', 'amount_total', 'date']
)
# Returns: [{'id': 1, 'name': ..., 'amount_total': ..., 'date': ...}, ...]

# BAD: search() + read() is slower
records = self.search([('state', '=', 'done')])
data = records.read(['name', 'amount_total', 'date'])
```

### Use _read_group() for Aggregations

**`_read_group()`** is the core aggregation method that `read_group()` calls internally. It returns raw tuples with proper recordsets for relational fields.

```python
# GOOD: _read_group() returns tuples: [(groupby_value, aggregate1, aggregate2, ...), ...]
for partner_id, amount_total, count in self._read_group(
    domain=[('state', '=', 'done')],
    groupby=['partner_id'],
    aggregates=['amount_total:sum', 'id:count'],
):
    # partner_id: recordset (Many2one field)
    # amount_total: float
    # count: int
    print(f"{partner_id.name}: {amount_total} ({count} orders)")
```

#### Converting to Dictionary for Efficient Lookup

```python
# GOOD: Convert _read_group result to dict for O(1) lookup
# From Odoo base: account_move_line.py
matching2lines = dict(self._read_group(
    domain=[('matching_number', 'in', matching_numbers)],
    groupby=['matching_number'],
    aggregates=['id:recordset'],
))
# Result: {matching_number: lines_recordset, ...}
```

#### Multiple Groupby Fields

```python
# GOOD: Multiple groupby fields
for matching_number, account, lines in self._read_group(
    domain=[('matching_number', 'in', temp_numbers)],
    groupby=['matching_number', 'account_id'],
    aggregates=['id:recordset'],
):
    # matching_number: string
    # account: account.account recordset
    # lines: account.move.line recordset
    if all(move.state == 'posted' for move in lines.move_id):
        # Process grouped lines
        pass
```

#### read_group() vs _read_group()

| Feature | `_read_group()` | `read_group()` |
|---------|-----------------|----------------|
| Return type | List of tuples | List of dicts |
| API style | `domain, groupby, aggregates` | `domain, fields, groupby` |
| Metadata | ❌ No `__domain`, `__context` | ✅ Includes metadata |
| Lazy grouping | ❌ Not supported | ✅ Supported |
| Empty group fill | ❌ Not supported | ✅ Supported |
| Recordsets | ✅ Proper browse records | ✅ Proper browse records |
| Used internally | ✅ Core method | Wrapper that calls `_read_group()` |
| Use case | Data processing, internal logic | UI components, reports |

**Key Insight**: `_read_group()` is the **core method** that `read_group()` calls internally (see `odoo/models.py:2888`). Both return proper recordsets for relational fields.

```python
# _read_group() - Core method, simpler API
# Returns: [(groupby_val1, agg1, agg2), (groupby_val2, agg1, agg2), ...]
data = self._read_group(
    domain=[('state', '=', 'done')],
    groupby=['partner_id'],
    aggregates=['amount_total:sum', '__count'],
)

# read_group() - Public API with metadata
# Returns: [{'partner_id': (1, 'Name'), 'amount_total': 100, '__domain': [...}, ...]
data = self.read_group(
    domain=[('state', '=', 'done')],
    fields=['amount_total'],
    groupby=['partner_id'],
    lazy=True,
)
```

**When to use `_read_group()`** (recommended for most cases):
- Data processing and aggregation
- Building internal data structures
- When you don't need `__domain` metadata
- When you want tuple unpacking for cleaner code
- **Used extensively in Odoo base code** (400+ files)

**When to use `read_group()`**:
- UI components that need `__domain` for drill-down
- Reports with lazy grouping
- When you need empty group filling
- Pivot graphs, kanban views

### Load Parameter for Read

```python
# GOOD: Use load='_classic_read' for simple fields
data = records.read(['name', 'date'], load='_classic_read')

# Use load=None to avoid computing fields
data = records.read(['name', 'state'], load=None)
```

### Bin Size for Binary Fields

```python
# GOOD: Get size instead of content
attachments.with_context(bin_size=True).read(['datas', 'name'])
# Returns: {'datas': 12345, ...} instead of base64 content
```

### Fetch Only What You Need

```python
# GOOD: Select only needed fields
products = self.env['product.product'].search_read(
    [('active', '=', True)],
    ['id', 'name', 'default_code', 'lst_price']
)

# BAD: Fetch all fields
products = self.env['product.product'].search([('active', '=', True)])
```

---

## Compute Field Optimization

### Store Expensive Computations

```python
# GOOD: Store expensive aggregations
amount_total = fields.Float(
    string='Total',
    compute='_compute_amount_total',
    store=True,
    # Store allows search/group by
    compute_sudo=True,  # Compute as admin for performance
)

@api.depends('line_ids.price_subtotal')
def _compute_amount_total(self):
    for order in self:
        order.amount_total = sum(order.line_ids.mapped('price_subtotal'))
```

### Use Precompute for Form Performance

```python
# Use precompute when field can be computed before creation
sequence = fields.Integer(
    string='Sequence',
    compute='_compute_sequence',
    precompute=True,  # Computed at form init
    store=False,
)

@api.depends('date_order')
def _compute_sequence(self):
    for order in self:
        if order.date_order:
            order.sequence = self.env['ir.sequence'].next_by_code(...)
```

**Warning**: `precompute=True` can be counterproductive for:
- Statistics fields (count, sum over search)
- Fields that require database reads
- One-off record creation (not batch)

### Avoid Recursive Dependencies

```python
# BAD: Recursive dependency
field_a = fields.Float(compute='_compute_a', store=True)
field_b = fields.Float(compute='_compute_b', store=True)

@api.depends('field_b')  # A depends on B
def _compute_a(self):
    for rec in self:
        rec.field_a = rec.field_b * 2

@api.depends('field_a')  # B depends on A - INFINITE LOOP
def _compute_b(self):
    for rec in self:
        rec.field_b = rec.field_a / 2

# GOOD: Use a common base field
amount = fields.Float(string='Amount')
tax = fields.Float(compute='_compute_tax', store=True)
total = fields.Float(compute='_compute_total', store=True)

@api.depends('amount')
def _compute_tax(self):
    for rec in self:
        rec.tax = rec.amount * 0.1

@api.depends('amount', 'tax')  # Both depend on amount only
def _compute_total(self):
    for rec in self:
        rec.total = rec.amount + rec.tax
```

---

## SQL Optimization

### When to Use Direct SQL

**Use SQL for**:
- Complex aggregations (count with grouping)
- Bulk data migration
- Reports with joins across many tables
- Performance-critical read operations

```python
def get_statistics(self):
    """Direct SQL for complex aggregation"""
    self.env.cr.execute("""
        SELECT
            state,
            COUNT(*) as count,
            SUM(amount_total) as total
        FROM sale_order
        WHERE create_date >= %s
        GROUP BY state
    """, (fields.date.today(),))
    return dict(self.env.cr.fetchall())
```

**Use SQL class for safety** (Odoo 18):
```python
from odoo.tools import SQL

def get_statistics(self):
    query = SQL("""
        SELECT state, COUNT(*), SUM(amount_total)
        FROM %s
        WHERE create_date >= %s
        GROUP BY state
    """, SQL.identifier('sale_order'), fields.date.today())

    return self.env.execute_query_dict(query)
```

### Never Use SQL for Writes (unless necessary)

```python
# BAD: SQL write bypasses ORM (no compute, no cache, no triggers)
self.env.cr.execute("UPDATE sale_order SET state='done' WHERE id IN %s", (ids,))

# GOOD: Use ORM write
self.browse(ids).write({'state': 'done'})
```

### Use execute_query for Read (Odoo 18)

```python
from odoo.tools import SQL

# GOOD: execute_query handles flush automatically
def get_order_totals(self):
    query = SQL("""
        SELECT id, amount_total
        FROM sale_order
        WHERE state = %s
    """, 'done')

    return self.env.execute_query_dict(query)
```

---

## Clean Code Performance Patterns

### Use Mapped() Instead of List Comprehension

```python
# GOOD: Use mapped() for field access
partner_ids = orders.mapped('partner_id.id')
names = orders.mapped('name')

# GOOD: mapped() works with nested paths
countries = orders.mapped('partner_id.country_id')

# GOOD: mapped() removes duplicates
all_tags = orders.mapped('tag_ids')  # Returns unique tags
```

### Use Filtered() for Conditional Operations

```python
# GOOD: Filter before processing
done_orders = orders.filtered(lambda o: o.state == 'done')
done_orders.action_invoice_create()

# GOOD: Chain filters
high_value = orders.filtered(lambda o: o.amount_total > 1000)
urgent = high_value.filtered(lambda o: o.priority == '2')
```

### Use Sorted() with Key

```python
# GOOD: Sort in memory for small sets
sorted_orders = orders.sorted(key=lambda o: o.amount_total, reverse=True)

# BAD: Don't sort in memory for large sets
# Use database order instead
orders = self.search([], order='amount_total DESC')
```

### Avoid Recomputation in Loops

```python
# BAD: Write in loop triggers recomputation each time
for order in orders:
    order.write({'state': 'done'})  # Triggers compute each iteration

# GOOD: Batch write - single compute at end
orders.write({'state': 'done'})

# GOOD: Use with_context to prevent recomputation
orders.with_context(tracking_disable=True).write({'state': 'done'})
```

---

## Performance Checklist

- [ ] Avoid `search()` inside loops
- [ ] Use `mapped()` instead of list comprehension for field access
- [ ] Use `search_read()` when you need dicts, not recordsets
- [ ] Use `_read_group()` for aggregations (core method; use `read_group()` only when you need `__domain` metadata or lazy grouping for UI)
- [ ] Store expensive computed fields
- [ ] Add all dependencies to `@api.depends`
- [ ] Use `with_context(bin_size=True)` for binary fields
- [ ] Use `with_context(active_test=False)` when including archived
- [ ] Batch create/write/unlink operations
- [ ] Add indexes on frequently searched fields
- [ ] Use `filtered()` before operations
- [ ] Don't use SQL for writes (use ORM)
- [ ] Use direct SQL for complex read aggregations only

---

## Common Performance Anti-Patterns

### Anti-Pattern 1: Search without limit

```python
# BAD: Could fetch millions of records
all_records = self.search([('state', '=', 'draft')])

# GOOD: Use limit or pagination
records = self.search([('state', '=', 'draft')], limit=100)
```

### Anti-Pattern 2: Computing in loop

```python
# BAD: Compute method does expensive operation
@api.depends('order_id')
def _compute_order_total(self):
    for line in self:
        # Search in loop - N queries
        line.order_total = self.search_count([
            ('order_id', '=', line.order_id.id)
        ])
```

### Anti-Pattern 3: Not using exists()

```python
# BAD: Fetches all records
records = self.search([('state', '=', 'done')])
if len(records) > 0:
    # ...

# GOOD: Only checks existence
exists = self.search_count([('state', '=', 'done')]) > 0
# OR
if self.search([('state', '=', 'done')], limit=1):
    # ...
```

### Anti-Pattern 4: Over-fetching

```python
# BAD: Fetches all fields then only uses one
records = self.search([('state', '=', 'done')])
for record in records:
    print(record.name)  # Only using name

# GOOD: Only fetch needed field
data = self.search_read([('state', '=', 'done')], ['name'])
for row in data:
    print(row['name'])
```

---

## Flush & Recompute (Odoo 18)

### Understanding Flush

Odoo 18 uses lazy writes - changes are cached and flushed to database later.

```python
# Flush specific fields to database
self.flush_model(['amount_total', 'state'])

# Flush current recordset only
self.flush_recordset(['amount'])

# Flush before direct SQL query
self.flush_model()  # Flush all pending changes
self.env.cr.execute("SELECT ...")
```

### flush_model() vs flush_recordset()

```python
# flush_model - flush for entire model (all records)
self.env['sale.order'].flush_model(['amount_total'])

# flush_recordset - flush only current records
orders.flush_recordset(['amount_total'])
```

### Recompute Control

```python
# Manual recompute of stored computed fields
self._recompute_model(['amount_total'])      # Entire model
self._recompute_recordset(['amount_total'])  # Current records
self._recompute_field(self._fields['amount_total'])  # Specific field

# Recompute with specific ids
self._recompute_field(field, ids=[1, 2, 3])
```

### Batch Recompute Optimization

```python
# GOOD: Let Odoo handle recomputation automatically
orders.write({'state': 'done'})
# amount_total will be recomputed in batch automatically

# AVOID: Manual recomputation in loop
for order in orders:
    order.write({'state': 'done'})
    order.amount_total  # Triggers individual recomputation
```

### Flush Before SQL Query (Odoo 18)

```python
from odoo.tools import SQL

# Mark fields to flush before SQL query
query = SQL("""
    SELECT id, amount
    FROM sale_order
    WHERE state = %s
""", 'done')

# Option 1: Mark fields to flush (auto-flushes those fields)
query.to_flush = [self._fields['state']]

# Option 2: Use execute_query_dict (auto-flushes)
results = self.env.execute_query_dict(query)
```

### with_context for Performance

```python
# Disable tracking for bulk operations (faster)
records.with_context(tracking_disable=True).write({'state': 'done'})

# Use bin_size for binary fields
attachments.with_context(bin_size=True).read(['datas', 'name'])

# Disable active_test to include archived
all_records = self.with_context(active_test=False).search([])
```


---

---
name: odoo-18-reports
description: Complete reference for Odoo 18 QWeb reports covering PDF/HTML reports, report templates, paper formats, custom reports, custom fonts, translatable templates, barcodes, and report actions.
globs: "**/*.{py,xml}"
topics:
  - QWeb reports (qweb-pdf, qweb-html)
  - Report templates and layouts
  - Paper formats (report.paperformat)
  - Custom reports with _get_report_values
  - Translatable reports (t-lang)
  - Barcodes in reports
  - Custom fonts for reports
  - Report actions and bindings
when_to_use:
  - Creating PDF reports for models
  - Designing report templates
  - Adding custom fonts to reports
  - Creating translatable reports
  - Implementing barcode support
  - Customizing report rendering
---

# Odoo 18 Reports Guide

Complete reference for Odoo 18 QWeb reports: PDF/HTML reports, templates, paper formats, and custom reports.

## Table of Contents

1. [Report Basics](#report-basics)
2. [Report Templates](#report-templates)
3. [Report Actions](#report-actions)
4. [Paper Formats](#paper-formats)
5. [Custom Reports](#custom-reports)
6. [Translatable Reports](#translatable-reports)
7. [Barcodes](#barcodes)
8. [Custom Fonts](#custom-fonts)

---

## Report Basics

### QWeb Reports

Reports in Odoo are written in HTML/QWeb and rendered to PDF using `wkhtmltopdf`.

#### Report Types

| Type | Description |
|------|-------------|
| `qweb-pdf` | PDF report (most common) |
| `qweb-html` | HTML report (for web viewing) |

### Report Declaration

```xml
<report
    id="account_invoices"
    model="account.move"
    string="Invoices"
    report_type="qweb-pdf"
    name="account.report_invoice"
    file="account_report_invoice"
    print_report_name="'Invoice-{}-{}'.format(object.number or 'n/a', object.state)"
/>
```

### Report Attributes

| Attribute | Type | Description | Required |
|-----------|------|-------------|----------|
| `id` | string | Unique identifier (external ID) | Yes |
| `model` | string | Model to report on | Yes |
| `string` / `name` | string | Human-readable name | Yes |
| `report_type` | string | `qweb-pdf` or `qweb-html` | No (default: qweb-pdf) |
| `name` | string | External ID of QWeb template | Yes |
| `file` | string | Output file name pattern | No |
| `print_report_name` | string | Python expression for file name | No |
| `groups_id` | Many2many | Groups allowed to view/use | No |
| `multi` | boolean | Don't show on form view if True | No |
| `paperformat_id` | Many2one | Paper format to use | No |
| `attachment_use` | boolean | Generate once, reprint stored | No |
| `attachment` | string | Python expression for attachment name | No |
| `binding_model_id` | Many2one | Model to bind action to | No |

### Report Action vs Record

The `<report>` tag creates two records:

1. **ir.actions.report** - The report action
2. **ir.ui.view** - The QWeb template

```xml
<!-- Shortcut: creates both records -->
<report
    id="my_report"
    model="my.model"
    name="my_module.my_report_template"
    report_type="qweb-pdf"
/>

<!-- Equivalent to: -->
<record id="my_report" model="ir.actions.report">
    <field name="name">My Report</field>
    <field name="model">my.model</field>
    <field name="report_name">my_module.my_report_template</field>
    <field name="report_type">qweb-pdf</field>
</record>

<template id="my_report_template">
    <!-- Template content -->
</template>
```

---

## Report Templates

### Minimal Template

```xml
<template id="report_invoice">
    <t t-call="web.html_container">
        <t t-foreach="docs" t-as="o">
            <t t-call="web.external_layout">
                <div class="page">
                    <h2>Invoice</h2>
                    <p>Invoice Number: <span t-field="o.name"/></p>
                    <p>Amount: <span t-field="o.amount_total"/></p>
                </div>
            </t>
        </t>
    </t>
</template>
```

### Template Structure

```
web.html_container
    └── web.external_layout (header + footer)
            └── div.page (your content)
```

### Available Variables

| Variable | Description |
|----------|-------------|
| `docs` | Records for the report (recordset) |
| `doc_ids` | List of IDs for `docs` |
| `doc_model` | Model name for `docs` |
| `time` | Python `time` module |
| `user` | Current user (res.user) |
| `res_company` | Current user's company |
| `website` | Current website (if any) |
| `web_base_url` | Base URL for webserver |
| `context_timestamp` | Function to convert datetime to user timezone |

### Using Variables

```xml
<template id="my_report">
    <t t-call="web.html_container">
        <t t-foreach="docs" t-as="o">
            <t t-call="web.external_layout">
                <div class="page">
                    <!-- Standard fields -->
                    <p t-field="o.name"/>
                    <p t-field="o.partner_id.name"/>

                    <!-- User info -->
                    <p>Printed by: <span t-field="user.name"/></p>

                    <!-- Company info -->
                    <p>Company: <span t-field="res_company.name"/></p>

                    <!-- Time -->
                    <p>Printed at: <span t-esc="time.strftime('%Y-%m-%d %H:%M')"/></p>

                    <!-- Context timestamp (converts to user timezone) -->
                    <p>Invoice date: <span t-esc="context_timestamp(o.invoice_date)"/></p>
                </div>
            </t>
        </t>
    </t>
</template>
```

### QWeb Directives

```xml
<!-- t-foreach: Loop -->
<t t-foreach="docs" t-as="doc">
    <p t-field="doc.name"/>
</t>

<!-- t-if: Condition -->
<p t-if="doc.state == 'draft'">Draft Document</p>

<!-- t-esc: Escape and render -->
<p t-esc="doc.description"/>

<!-- t-field: Smart rendering (dates, currencies, etc.) -->
<span t-field="o.date_order"/>  <!-- Formatted date -->
<span t-field="o.amount_total"/>  <!-- Formatted currency -->

<!-- t-call: Include another template -->
<t t-call="web.external_layout"/>

<!-- t-set: Set variable -->
<t t-set="total" t-value="sum(line.price_unit * line.quantity for line in o.line_ids)"/>

<!-- t-att: Set attribute -->
<a t-attf-href="https://example.com/invoice/{{o.id}}">View</a>
```

### Direct Attributes in Odoo 18

```xml
<!-- OLD (deprecated) -->
<div t-attf-class="{'alert-danger': o.state == 'error'}"/>

<!-- NEW (Odoo 18) -->
<div class="alert-danger" t-if="o.state == 'error'"/>
```

---

## Report Actions

### Basic Report Action

```xml
<record id="report_my_report" model="ir.actions.report">
    <field name="name">My Report</field>
    <field name="model">my.model</field>
    <field name="report_type">qweb-pdf</field>
    <field name="report_name">my_module.my_report_template</field>
</record>
```

### Report with Dynamic Filename

```xml
<record id="report_invoice" model="ir.actions.report">
    <field name="name">Invoice</field>
    <field name="model">account.move</field>
    <field name="report_type">qweb-pdf</field>
    <field name="report_name">account.report_invoice</field>
    <field name="print_report_name">
        'Invoice-{}-{}'.format(
            object.number or 'n/a',
            object.state
        )
    </field>
</record>
```

### Report with Attachment

```xml
<record id="report_with_attachment" model="ir.actions.report">
    <field name="name">Report with Attachment</field>
    <field name="model">my.model</field>
    <field name="report_type">qweb-pdf</field>
    <field name="report_name">my_module.my_report</field>
    <field name="attachment_use" eval="True"/>
    <field name="attachment">'my_report_' + str(object.id) + '.pdf'</field>
</record>
```

### Report with Groups

```xml
<record id="report_manager_only" model="ir.actions.report">
    <field name="name">Manager Report</field>
    <field name="model">my.model</field>
    <field name="report_type">qweb-pdf</field>
    <field name="report_name">my_module.manager_report</field>
    <field name="groups_id" eval="[(4, ref('base.group_system'))]"/>
</record>
```

### Print Menu Binding

To show in Print menu:

```xml
<record id="my_report" model="ir.actions.report">
    <field name="name">My Report</field>
    <field name="model">my.model</field>
    <field name="report_type">qweb-pdf</field>
    <field name="report_name">my_module.my_report</field>
    <field name="binding_model_id" ref="model_my_model"/>
    <!-- binding_type automatically 'report' -->
</record>
```

---

## Paper Formats

### report.paperformat Model

Define custom paper sizes and margins.

```xml
<record id="paperformat_euro" model="report.paperformat">
    <field name="name">European A4</field>
    <field name="default" eval="True"/>
    <field name="format">A4</field>
    <field name="page_height">297</field>
    <field name="page_width">210</field>
    <field name="orientation">Portrait</field>
    <field name="margin_top">40</field>
    <field name="margin_bottom">20</field>
    <field name="margin_left">7</field>
    <field name="margin_right">7</field>
    <field name="header_line" eval="False"/>
    <field name="header_spacing">35</field>
    <field name="dpi">90</field>
</record>
```

### Paper Format Fields

| Field | Description | Default |
|-------|-------------|---------|
| `name` | Description/mnemonic | Required |
| `format` | Predefined format or `custom` | A4 |
| `page_height` | Height in mm (if custom) | - |
| `page_width` | Width in mm (if custom) | - |
| `orientation` | `Portrait` or `Landscape` | Portrait |
| `margin_top` | Top margin in mm | - |
| `margin_bottom` | Bottom margin in mm | - |
| `margin_left` | Left margin in mm | - |
| `margin_right` | Right margin in mm | - |
| `header_line` | Show header line | False |
| `header_spacing` | Space before header | - |
| `dpi` | Output DPI | 90 |

### Predefined Formats

A0, A1, A2, A3, A4, A5, A6, A7, A8, A9, A10
B0, B1, B2, B3, B4, B5, B6, B7, B8, B9, B10
Letter, Legal, Tabloid

### Custom Paper Format

```xml
<record id="paperformat_french_check" model="report.paperformat">
    <field name="name">French Bank Check</field>
    <field name="default" eval="True"/>
    <field name="format">custom</field>
    <field name="page_height">80</field>
    <field name="page_width">175</field>
    <field name="orientation">Portrait</field>
    <field name="margin_top">3</field>
    <field name="margin_bottom">3</field>
    <field name="margin_left">3</field>
    <field name="margin_right">3</field>
    <field name="header_line" eval="False"/>
    <field name="header_spacing">3</field>
    <field name="dpi">80</field>
</record>
```

### Using Paper Format

```xml
<report
    id="my_report"
    model="my.model"
    name="my_module.my_report"
    report_type="qweb-pdf"
    paperformat_id="my_module.paperformat_euro"
/>
```

---

## Custom Reports

### Custom Report Model

For additional data in reports, create a custom report model:

```python
from odoo import api, models

class ReportMyModel(models.AbstractModel):
    _name = 'report.my_module.my_report'
    _description = 'Custom My Model Report'

    @api.model
    def _get_report_values(self, docids, data=None):
        # Get the report action
        report = self.env['ir.actions.report']._get_report_from_name(
            'my_module.my_report'
        )

        # Get the records
        docs = self.env[report.model].browse(docids)

        # Custom data
        custom_data = {}
        for doc in docs:
            custom_data[doc.id] = {
                'line_count': len(doc.line_ids),
                'total_amount': sum(line.price_subtotal for line in doc.line_ids),
                'special_field': self._compute_special(doc),
            }

        return {
            'docs': docs,
            'custom_data': custom_data,
        }

    def _compute_special(self, doc):
        # Custom computation
        return "Special Value"
```

### Using Custom Data in Template

```xml
<template id="my_module.my_report">
    <t t-call="web.html_container">
        <t t-foreach="docs" t-as="o">
            <t t-call="web.external_layout">
                <div class="page">
                    <h2>Document: <span t-field="o.name"/></h2>

                    <!-- Access custom data -->
                    <p>Line Count: <span t-esc="custom_data[o.id]['line_count']"/></p>
                    <p>Total: <span t-esc="custom_data[o.id]['total_amount']"/></p>
                    <p>Special: <span t-esc="custom_data[o.id]['special_field']"/></p>
                </div>
            </t>
        </t>
    </t>
</template>
```

### Custom Report with Related Data

```python
class ReportSaleOrder(models.AbstractModel):
    _name = 'report.sale.order'

    def _get_report_values(self, docids, data=None):
        docs = self.env['sale.order'].browse(docids)

        # Fetch related data
        products = self.env['product.product'].search([
            ('id', 'in', docs.order_line.mapped('product_id').ids)
        ])

        return {
            'docs': docs,
            'products': products,
            'product_categories': self._get_categories(products),
        }

    def _get_categories(self, products):
        categories = products.mapped('categ_id')
        return categories.sorted('name')
```

```xml
<template id="sale.order.report">
    <t t-call="web.html_container">
        <t t-foreach="docs" t-as="order">
            <t t-call="web.external_layout">
                <div class="page">
                    <h2>Order: <span t-field="order.name"/></h2>

                    <!-- Use custom data -->
                    <h3>Product Categories</h3>
                    <ul>
                        <t t-foreach="product_categories" t-as="cat">
                            <li t-esc="cat.name"/>
                        </t>
                    </ul>
                </div>
            </t>
        </t>
    </t>
</template>
```

---

## Translatable Reports

### Basic Translatable Template

```xml
<!-- Main template -->
<template id="report_saleorder">
    <t t-call="web.html_container">
        <t t-foreach="docs" t-as="doc">
            <!-- Call translatable template with t-lang -->
            <t t-call="sale.report_saleorder_document" t-lang="doc.partner_id.lang"/>
        </t>
    </t>
</template>

<!-- Translatable template -->
<template id="report_saleorder_document">
    <!-- Re-browse with proper language for translatable fields -->
    <t t-set="doc" t-value="doc.with_context(lang=doc.partner_id.lang)"/>
    <t t-call="web.external_layout">
        <div class="page">
            <p t-field="doc.partner_id.name"/>  <!-- Translated -->
            <p t-field="doc.state"/>  <!-- Translated if selection is translated -->
        </div>
    </t>
</template>
```

### Partial Translation

Translate only the body, keep header/footer in default language:

```xml
<template id="report_saleorder">
    <t t-call="web.html_container">
        <t t-foreach="docs" t-as="doc">
            <t t-call="web.external_layout" t-lang="en_US">
                <div class="page">
                    <t t-set="doc" t-value="doc.with_context(lang=doc.partner_id.lang)"/>
                    <!-- Content in partner language, header/footer in English -->
                </div>
            </t>
        </t>
    </t>
</template>
```

### Important Notes

- **Only works with `t-call`** - Cannot use `t-lang` on arbitrary XML nodes
- **Re-browse is necessary** - For translatable fields like country names, sales terms
- **Not always needed** - If report doesn't use translatable record fields, skip re-browse (performance)

---

## Barcodes

### Barcode Images

Barcodes are returned by a controller and can be embedded in reports.

```xml
<!-- Basic QR code -->
<img t-att-src="'/report/barcode/QR/%s' % 'My text'"/>

<!-- QR code with query string -->
<img t-att-src="'/report/barcode/?barcode_type=%s&amp;value=%s&amp;width=%s&amp;height=%s' % (
    'QR', 'My text', 200, 200
)"/>

<!-- EAN-13 barcode -->
<img t-att-src="'/report/barcode/?barcode_type=%s&amp;value=%s' % (
    'EAN13', doc.product_id.barcode
)"/>
```

### Barcode Types

| Type | Description |
|------|-------------|
| `QR` | QR Code (2D) |
| `EAN13` | EAN-13 (1D, 13 digits) |
| `EAN8` | EAN-8 (1D, 8 digits) |
| `UPCA` | UPC-A (1D, 12 digits) |
| `Code128` | Code 128 (1D, variable) |
| `Code39` | Code 39 (1D, variable) |
| `ISBN` | ISBN (1D, for books) |

### Barcode Parameters

| Parameter | Description |
|-----------|-------------|
| `barcode_type` | Type of barcode |
| `value` | Data to encode |
| `width` | Width in pixels |
| `height` | Height in pixels |
| `humanreadable` | Show text below barcode (1 or 0) |

### Example: Product Barcode

```xml
<template id="product_report_barcode">
    <t t-call="web.html_container">
        <t t-foreach="docs" t-as="product">
            <t t-call="web.external_layout">
                <div class="page">
                    <h2 t-field="product.name"/>
                    <p>Barcode: <span t-field="product.barcode"/></p>

                    <!-- Barcode image -->
                    <img t-att-src="'/report/barcode/?barcode_type=%s&amp;value=%s&amp;width=%s&amp;height=%s&amp;humanreadable=1' % (
                        'EAN13',
                        product.barcode or '0000000000000',
                        300,
                        100
                    )"/>
                </div>
            </t>
        </t>
    </t>
</template>
```

---

## Custom Fonts

### Adding Custom Fonts

1. Add font to `web.report_assets_common` bundle
2. Define `@font-face` in CSS
3. Use font in QWeb template

### Step 1: Add Font to Assets

```xml
<template id="report_assets_common_custom_fonts" inherit_id="web.report_assets_common">
    <xpath expr="." position="inside">
        <link href="/my_module/static/src/less/fonts.less" rel="stylesheet" type="text/less"/>
    </xpath>
</template>
```

### Step 2: Define Font Face

```less
/* /my_module/static/src/less/fonts.less */
@font-face {
    font-family: 'MonixBold';
    src: local('MonixBold'),
         local('MonixBold'),
         url(/my_module/static/fonts/MonixBold-Regular.otf) format('opentype');
}

.h1-title-big {
    font-family: MonixBold;
    font-size: 60px;
    color: #3399cc;
}
```

### Step 3: Use in Template

```xml
<template id="my_report">
    <t t-call="web.html_container">
        <t t-foreach="docs" t-as="doc">
            <t t-call="web.external_layout">
                <div class="page">
                    <h1 class="h1-title-big" t-field="doc.name"/>
                </div>
            </t>
        </t>
    </t>
</template>
```

### Important Notes

- Must add to `web.report_assets_common` (NOT `web.assets_common` or `web.assets_backend`)
- Must define `@font-face` even if defined elsewhere
- Font files go in `static/fonts/` or `static/src/fonts/`

---

## Quick Reference

### Report Declaration

```xml
<report
    id="my_report"
    model="my.model"
    string="My Report"
    report_type="qweb-pdf"
    name="my_module.my_template"
    file="my_report"
    print_report_name="'Report-' + str(object.id)"
    groups_id="base.group_user"
    paperformat_id="my_module.paperformat_custom"
    attachment_use="False"
    binding_model_id="model_my_model"
/>
```

### Template Skeleton

```xml
<template id="my_template">
    <t t-call="web.html_container">
        <t t-foreach="docs" t-as="o">
            <t t-call="web.external_layout">
                <div class="page">
                    <!-- Your content -->
                </div>
            </t>
        </t>
    </t>
</template>
```

### Common QWeb in Reports

| Directive | Usage |
|-----------|-------|
| `t-call="web.html_container"` | Report wrapper |
| `t-call="web.external_layout"` | Header + footer |
| `div.page` | Main content area |
| `t-field="o.field"` | Smart rendering |
| `t-esc="o.variable"` | Escape + render |
| `t-foreach="docs" t-as="o"` | Loop over records |
| `t-if="condition"` | Condition |
| `t-set="var" t-value="value"` | Set variable |
| `t-attf-href="url"` | Attribute with format |
| `t-lang="lang_code"` | Set translation language |

### Direct URLs

| URL | Description |
|-----|-------------|
| `/report/html/module.report/ID` | HTML version |
| `/report/pdf/module.report/ID` | PDF version |
| `/report/barcode/QR/TEXT` | QR code image |
| `/report/barcode/?barcode_type=...` | Barcode with parameters |

---

**For more Odoo 18 guides, see [SKILL.md](../SKILL.md)**


---

---
name: odoo-18-security
description: Complete reference for Odoo 18 security covering access rights (ACL), record rules, field-level access, security pitfalls, SQL injection prevention, XSS prevention, and safe coding practices.
globs: "**/*.{py,xml,csv}"
topics:
  - Access rights (ir.model.access.csv)
  - Record rules (ir.rule)
  - Field-level access (groups attribute)
  - Security pitfalls (SQL injection, XSS, eval)
  - User groups and categories
  - ACL vs Record Rules interaction
  - Public/Portal user security
when_to_use:
  - Configuring security for new models
  - Setting up access rights CSV
  - Creating record rules
  - Preventing security vulnerabilities
  - Understanding multi-company security
  - Implementing field-level permissions
---

# Odoo 18 Security Guide

Complete reference for Odoo 18 security: access rights, record rules, field access, and preventing security pitfalls.

## Table of Contents

1. [Security Overview](#security-overview)
2. [User Groups](#user-groups)
3. [Access Rights (ACL)](#access-rights-acl)
4. [Record Rules](#record-rules)
5. [Field-Level Access](#field-level-access)
6. [Security Pitfalls](#security-pitfalls)

---

## Security Overview

### Two-Layer Security

Odoo provides two main data-driven security mechanisms:

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| 1 | Access Rights (ACL) | Grants access to an entire model for operations |
| 2 | Record Rules | Restricts which specific records can be accessed |

Both are linked to users through **groups**. A user belongs to multiple groups, and security mechanisms apply to all groups cumulatively.

### Access Control Flow

```
User Request
    ↓
Is user in a group with ACL access?  ───→ No ───→ Access Denied
    ↓ Yes
Do any record rules apply?            ───→ No rules ───→ Access Granted
    ↓
Do all global rules match?           ───→ No ───→ Access Denied
    ↓ Yes
Do any group rule match?             ───→ Yes ───→ Access Granted
    ↓ No
Access Denied
```

---

## User Groups

### res.groups - User Groups

Groups are the foundation of Odoo security.

```python
# Creating a group via XML
<record id="group_trip_manager" model="res.groups">
    <field name="name">Trip Manager</field>
    <field name="category_id" ref="base.module_category_trip_management"/>
    <field name="implied_ids" eval="[(4, ref('base.group_user'))]"/>
    <field name="comment">Can manage business trips</field>
</record>
```

### Group Fields

| Field | Description |
|-------|-------------|
| `name` | User-readable name of the group |
| `category_id` | Module category (for grouping in UI) |
| `implied_ids` | Other groups automatically applied |
| `comment` | Additional notes |

### Group Inheritance

```xml
<!-- Manager group includes Employee group -->
<record id="group_manager" model="res.groups">
    <field name="name">Manager</field>
    <field name="implied_ids" eval="[(4, ref('base.group_user'))]"/>
</record>
```

Users in `group_manager` automatically get `base.group_user` too.

### Checking Groups in Code

```python
# Check if user has group
if self.env.user.has_group('my_module.group_manager'):
    # Do manager-only things
    pass

# Check with sudo
if self.sudo().env.user.has_group('base.group_system'):
    # System-only things
    pass
```

---

## Access Rights (ACL)

### ir.model.access - Model-Level Access

Access rights grant CRUD operations on entire models.

### Access Rights CSV File

```
security/
└── ir.model.access.csv
```

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_trip_user,trip.user,model_business_trip,base.group_user,1,0,0,0
access_trip_manager,trip.manager,model_business_trip,group_trip_manager,1,1,1,1
access_trip_all,trip.all,model_business_trip,,1,0,0,0
```

### CSV Fields

| Field | Description |
|-------|-------------|
| `id` | Unique external ID for this access record |
| `name` | Human-readable name |
| `model_id:id` | Model this ACL controls (must match `_name`) |
| `group_id:id` | Group granted access (empty = all users) |
| `perm_read` | Can read records |
| `perm_write` | Can update records |
| `perm_create` | Can create records |
| `perm_unlink` | Can delete records |

### Access Rules

- **Additive**: User's access = union of all their groups' access
- **Empty group_id**: Access granted to **everyone** (including public/portal)
- **At least one**: User needs at least one group with access to perform operation

### Example ACLs

```csv
# Employees can read trips
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_trip_read,trip.read,model_business_trip,base.group_user,1,0,0,0

# Managers can do everything
access_trip_full,trip.full,model_business_trip,module.group_trip_manager,1,1,1,1

# Portal users can read their own trips (via record rules)
access_trip_portal,trip.portal,model_business_trip,base.group_portal,1,0,0,0

# Public (non-logged in) cannot access
# (No entry = no access)
```

### Creating ACLs via Python (Not Recommended)

```python
# Possible but use CSV instead
self.env['ir.model.access'].create({
    'name': 'trip.user',
    'model_id': self.env.ref('model_business_trip').id,
    'group_id': self.env.ref('base.group_user').id,
    'perm_read': True,
    'perm_write': False,
    'perm_create': False,
    'perm_unlink': False,
})
```

---

## Record Rules

### ir.rule - Record-Level Security

Record rules restrict which specific records a user can access based on domain filters.

### Record Rule Structure

```xml
<record id="trip_personal_rule" model="ir.rule">
    <field name="name">Personal Trips</field>
    <field name="model_id" ref="model_business_trip"/>
    <field name="domain_force">[('user_id', '=', user.id)]</field>
    <field name="groups" eval="[(4, ref('base.group_user'))]"/>
    <field name="perm_read" eval="True"/>
    <field name="perm_write" eval="True"/>
    <field name="perm_create" eval="True"/>
    <field name="perm_unlink" eval="True"/>
</record>
```

### Record Rule Fields

| Field | Description |
|-------|-------------|
| `name` | Description of the rule |
| `model_id` | Model this rule applies to |
| `groups` | Groups this rule applies to (empty = global rule) |
| `domain_force` | Domain expression to filter records |
| `perm_read` | Rule applies to read operations |
| `perm_write` | Rule applies to write operations |
| `perm_create` | Rule applies to create operations |
| `perm_unlink` | Rule applies to delete operations |

### Domain Force Variables

Available variables in `domain_force`:

| Variable | Type | Description |
|----------|------|-------------|
| `user` | Recordset | Current user (singleton) |
| `user.id` | Int | Current user ID |
| `user.company_id` | Int | Current user's main company ID |
| `user.company_ids` | List[Int] | All company IDs user has access to |
| `time` | Module | Python `time` module |
| `datetime` | Module | Python `datetime` module |

### Rule Evaluation Context

```python
# Example: Users can only see their own records
domain_force = [('user_id', '=', user.id)]

# Example: Multi-company
domain_force = [('company_id', 'in', user.company_ids)]

# Example: Time-based
domain_force = [('create_date', '>=', time.strftime('%Y-%m-%d'))]

# Example: Complex with user's company
domain_force = [
    '|',
    ('company_id', '=', False),
    ('company_id', 'in', user.company_ids)
]
```

### Global vs Group Rules

**Critical Difference:**

| Rule Type | Behavior |
|-----------|----------|
| **Global** (no groups) | All global rules **intersect** - ALL must match |
| **Group** (has groups) | Group rules **unify** - ANY can match |
| Combined | Global + Group = **intersect** |

```xml
<!-- Global Rule 1: Must be active -->
<record id="rule_active" model="ir.rule">
    <field name="name">Active Records</field>
    <field name="model_id" ref="model_business_trip"/>
    <field name="domain_force">[('active', '=', True)]</field>
    <field name="global" eval="True"/>
</record>

<!-- Global Rule 2: Must belong to user's company -->
<record id="rule_company" model="ir.rule">
    <field name="name">User Company</field>
    <field name="model_id" ref="model_business_trip"/>
    <field name="domain_force">[('company_id', 'in', user.company_ids)]</field>
    <field name="global" eval="True"/>
</record>

<!-- Result: Records must be BOTH active AND in user's company -->
```

```xml
<!-- Group Rule: Employees see own records -->
<record id="rule_employee_own" model="ir.rule">
    <field name="name">Employee Own Records</field>
    <field name="model_id" ref="model_business_trip"/>
    <field name="domain_force">[('user_id', '=', user.id)]</field>
    <field name="groups" eval="[(4, ref('base.group_user'))]"/>
</record>

<!-- Group Rule: Managers see all records -->
<record id="rule_manager_all" model="ir.rule">
    <field name="name">Manager All Records</field>
    <field name="model_id" ref="model_business_trip"/>
    <field name="domain_force">[(1, '=', 1)]</field>
    <field name="groups" eval="[(4, ref('module.group_manager'))]"/>
</record>

<!-- Result: Employees see own, Managers see all (because rules unify) -->
```

### Danger: Multiple Global Rules

**Warning**: Creating multiple global rules is risky as it can create non-overlapping rulesets:

```xml
<!-- DANGEROUS: Two restrictive global rules -->
<record id="rule_a" model="ir.rule">
    <field name="domain_force">[('state', '=', 'draft')]</field>
    <field name="global" eval="True"/>
</record>

<record id="rule_b" model="ir.rule">
    <field name="domain_force">[('state', '=', 'done')]</field>
    <field name="global" eval="True"/>
</record>

<!-- Result: NO records match both conditions! All access removed. -->
```

### Record Rule Examples

#### Own Records Only

```xml
<record id="personal_trip_rule" model="ir.rule">
    <field name="name">Personal Trips</field>
    <field name="model_id" ref="model_business_trip"/>
    <field name="domain_force">[('user_id', '=', user.id)]</field>
    <field name="groups" eval="[(4, ref('base.group_user'))]"/>
</record>
```

#### Multi-Company Security

```xml
<record id="company_rule" model="ir.rule">
    <field name="name">Multi-company Trips</field>
    <field name="model_id" ref="model_business_trip"/>
    <field name="domain_force">
        ['|',
        ('company_id', '=', False),
        ('company_id', 'in', user.company_ids)]
    </field>
    <field name="global" eval="True"/>
</record>
```

#### Read-Own, Write-Manager

```xml
<!-- Employees read own -->
<record id="trip_read_own" model="ir.rule">
    <field name="name">Trip: Read Own</field>
    <field name="model_id" ref="model_business_trip"/>
    <field name="domain_force">[('user_id', '=', user.id)]</field>
    <field name="groups" eval="[(4, ref('base.group_user'))]"/>
    <field name="perm_read" eval="True"/>
    <field name="perm_write" eval="False"/>
    <field name="perm_create" eval="True"/>
    <field name="perm_unlink" eval="False"/>
</record>

<!-- Managers read all -->
<record id="trip_read_all" model="ir.rule">
    <field name="name">Trip: Read All (Manager)</field>
    <field name="model_id" ref="model_business_trip"/>
    <field name="domain_force">[(1, '=', 1)]</field>
    <field name="groups" eval="[(4, ref('module.group_manager'))]"/>
    <field name="perm_read" eval="True"/>
</record>
```

#### Portal User Rules

```xml
<!-- Portal users see their own data -->
<record id="trip_portal_rule" model="ir.rule">
    <field name="name">Trips: Portal Own</field>
    <field name="model_id" ref="model_business_trip"/>
    <field name="domain_force">[('partner_id', '=', user.partner_id.id)]</field>
    <field name="groups" eval="[(4, ref('base.group_portal'))]"/>
    <field name="perm_read" eval="True"/>
</record>
```

### Testing Record Rules

```python
def test_record_rules(self):
    # Test as regular user
    trips = self.env['business.trip'].sudo(self.user_employee).search([])
    assert trips, "Employee should see their trips"

    # Test as manager
    all_trips = self.env['business.trip'].sudo(self.user_manager).search([])
    assert len(all_trips) >= len(trips), "Manager should see all trips"
```

---

## Field-Level Access

### Field Groups Attribute

Restrict access to specific fields using the `groups` parameter:

```python
class BusinessTrip(models.Model):
    _name = 'business.trip'

    name = fields.Char()  # Everyone
    internal_notes = fields.Text(groups='base.group_user')  # Employees only
    secret_code = fields.Char(groups='module.group_manager')  # Managers only
    salary = fields.Float(groups='base.group_system')  # Admin only
```

### Field Access Effects

When a user lacks access to a field:
1. Field automatically removed from views
2. Field removed from `fields_get()` response
3. Explicit read/write raises `AccessError`

### Checking Field Access

```python
# Check if user can access field
if self.env.user.has_group('base.group_user'):
    # Can access internal_notes
    records.read(['internal_notes'])
else:
    # Cannot access - will be filtered out
    records.read(['name'])  # Only name
```

### Related Fields with Groups

```python
# Restrict access to partner's email
partner_email = fields.Char(
    related='partner_id.email',
    groups='base.group_user'
)
```

---

## Security Pitfalls

### 1. Unsafe Public Methods

**Problem**: Any public method can be called via RPC with arbitrary parameters.

```python
# BAD: Public method with untrusted parameters
def action_done(self):
    if self.state == "draft":
        self._set_state("done")  # No ACL check!

# GOOD: Use private method with ACL-protected wrapper
def action_done(self):
    if not self.env.user.has_group('base.group_manager'):
        raise AccessError("Only managers can do this")
    self._set_state("done")

def _set_state(self, new_state):
    self.sudo().write({"state": new_state})
```

### 2. Bypassing ORM

**Problem**: Using `cr.execute()` bypasses security.

```python
# VERY BAD: Direct SQL - bypasses ACL, record rules, translations
self.env.cr.execute(
    'SELECT id FROM auction_lots WHERE auction_id IN (' +
    ','.join(map(str, ids)) + ')'
)

# BAD: Still bypasses ORM
self.env.cr.execute(
    'SELECT id FROM auction_lots WHERE auction_id IN %s',
    (tuple(ids),)
)

# GOOD: Use ORM
lots = self.search([('auction_id', 'in', ids)])
```

### 3. SQL Injection

**Problem**: String concatenation in SQL queries.

```python
# VERY BAD: SQL injection vulnerability
query = "SELECT id FROM table WHERE name = '" + user_input + "'"
self.env.cr.execute(query)

# BAD: Still using concatenation
query = "SELECT id FROM table WHERE name = '%s'" % user_input
self.env.cr.execute(query)

# GOOD: Use parameterized queries
self.env.cr.execute("SELECT id FROM table WHERE name = %s", (user_input,))
```

### 4. Unescaped Content (XSS)

**Problem**: Using `t-raw` with user-provided content.

```xml
<!-- BAD: t-raw with user content -->
<div t-raw="info_message"/>

<!-- GOOD: t-esc auto-escapes -->
<div t-esc="info_message"/>
```

```python
# BAD: Unescaped user content
QWeb.render('insecure_template', {
    'info_message': user_provided_content,
})

# GOOD: Separate structure from content
QWeb.render('secure_template', {
    'message': user_provided_content,
})
```

### 5. Using Markup Safely

```python
from markupsafe import Markup

# GOOD: Structure is Markup, content is escaped
message = Markup("<p>%s</p>") % user_provided_content

# GOOD: Use escape() to convert text to Markup
from odoo.tools.misc import html_escape
safe_content = html_escape(user_provided_content)
message = Markup("<p>%s</p>") % safe_content

# BAD: f-strings insert before escaping
# Markup(f"<p>{self.user_input}</p>")  # WRONG!

# GOOD: Use format() with Markup
Markup("<p>{field}</p>").format(field=user_input)
```

### 6. Evaluating Content

```python
# VERY BAD: eval is dangerous
domain = eval(self.filter_domain)
self.search(domain)

# BAD: safe_eval still powerful
from odoo.tools import safe_eval
domain = safe_eval(self.filter_domain)
self.search(domain)

# GOOD: Use literal_eval for parsing
from ast import literal_eval
domain = literal_eval(self.filter_domain)
self.search(domain)
```

### 7. Accessing Dynamic Attributes

```python
# BAD: getattr can access private methods/attributes
def _get_state(self, res_id, state_field):
    record = self.sudo().browse(res_id)
    return getattr(record, state_field)  # Unsafe!

# GOOD: Use __getitem__ which respects field access rules
def _get_state(self, res_id, state_field):
    record = self.sudo().browse(res_id)
    return record[state_field]  # Safe
```

### 8. sudo() Overuse

```python
# BAD: sudo() everywhere bypasses all security
def action_archive(self):
    for record in self:
        record.sudo().write({'active': False})  # No checks!

# GOOD: Use sudo() sparingly and only when needed
def action_archive(self):
    # Archive as current user (ACL checked)
    self.write({'active': False})

# GOOD: Use sudo() to access related model for permission check
def check_access(self):
    # Check if partner is accessible
    partner = self.partner_id.sudo()
    if not partner.check_access_rights('read'):
        raise AccessError("Cannot access partner")
```

### 9. Missing Validation

```python
# BAD: No validation on user input
def update_from_form(self, values):
    self.write(values)  # User could set any field!

# GOOD: Validate and whitelist
def update_from_form(self, values):
    allowed = {'name', 'date', 'notes'}
    updates = {k: v for k, v in values.items() if k in allowed}
    self.write(updates)
```

### 10. Time-of-Check to Time-of-Use (TOCTOU)

```python
# BAD: State changes between check and use
def process_payment(self):
    if self.state != 'paid':  # Check
        # ... time passes ...
        self.write({'state': 'processed'})  # Use (state might have changed)

# GOOD: Use database constraints
_state_constraint = sql_constraint(
    'check_state_before_process',
    'CHECK (state = ''paid'')',
    'Can only process paid records'
)

# Or use @api.constrains
@api.constrains('state')
def _check_state(self):
    for record in self:
        if record.state == 'processed' and record.state != 'paid':
            raise ValidationError("Must be paid to process")
```

---

## Quick Reference

### Security Checklist

| ☐ | Task |
|---|------|
| ☐ | Define user groups |
| ☐ | Create ir.model.access.csv |
| ☐ | Add ACL for each model |
| ☐ | Create record rules for multi-company |
| ☐ | Create record rules for own/all access |
| ☐ | Test with different user roles |
| ☐ | Test with portal/public users |
| ☐ | Review public methods for security |
| ☐ | Check for SQL injection risks |
| ☐ | Check for XSS vulnerabilities |

### Common Security Patterns

#### Own Records Only (Employee)

```python
# Model
user_id = fields.Many2one('res.users', default=lambda s: s.env.user)
```

```xml
<!-- ACL -->
access_model_user,model_my_model,base.group_user,1,0,0,0

<!-- Rule -->
<record id="model_own_rule" model="ir.rule">
    <field name="domain_force">[('user_id', '=', user.id)]</field>
    <field name="groups" eval="[(4, ref('base.group_user'))]"/>
</record>
```

#### Managers See All

```xml
<record id="model_all_rule" model="ir.rule">
    <field name="domain_force">[(1, '=', 1)]</field>
    <field name="groups" eval="[(4, ref('module.group_manager'))]"/>
</record>
```

#### Multi-Company

```python
# Model
company_id = fields.Many2one('res.company', default=lambda s: s.env.company)
```

```xml
<!-- Global rule -->
<record id="model_company_rule" model="ir.rule">
    <field name="domain_force">
        ['|', ('company_id', '=', False), ('company_id', 'in', user.company_ids)]
    </field>
    <field name="global" eval="True"/>
</record>
```

### Security Debugging

```python
# Check current user's groups
self.env.user.groups_id  # All groups

# Check specific group
self.env.user.has_group('base.group_system')

# Check access rights
model.check_access_rights('read')
model.check_access_rights('write', raise_exception=False)

# Check record access
record.check_access_rule('read')
record.check_access_rule('write')
```

---

**For more Odoo 18 guides, see [SKILL.md](../SKILL.md)**


---

---
name: odoo-18-testing
description: Comprehensive guide for testing Odoo 18 modules, including
  TransactionCase, HttpCase, browser testing, and best practices.
globs: "**/tests/**/*.py"
topics:
  - Test case types (TransactionCase, SavepointCase, HttpCase)
  - Test decorators (tagged, users, warmup)
  - Form testing and fixtures
  - Browser testing (browser_js)
  - Mocking and patching
when_to_use:
  - Writing module tests
  - Adding regression coverage
  - Testing UI flows or JS
  - Mocking external services
---

# Odoo 18 Testing Guide

Comprehensive guide for testing Odoo 18 modules, covering test classes, decorators, mocking, form testing, browser testing, and best practices.

## Table of Contents

1. [Base Test Classes](#base-test-classes)
2. [Test Decorators](#test-decorators)
3. [Mocking and Patching](#mocking-and-patching)
4. [Form Testing](#form-testing)
5. [Browser Testing](#browser-testing)
6. [Setup and Teardown](#setup-and-teardown)
7. [Assert Methods](#assert-methods)
8. [Test Data Helpers](#test-data-helpers)
9. [Running Tests](#running-tests)
10. [Best Practices](#best-practices)

---

## Base Test Classes

### Location

Test infrastructure is located in `/odoo/tests/`:

- `common.py` - Base test classes and utilities
- `case.py` - Core TestCase implementation
- `form.py` - Form testing utility
- `loader.py` - Test loading and discovery
- `tag_selector.py` - Tag-based test filtering

### Class Hierarchy

```
BaseCase (abstract)
├── TransactionCase
│   └── (uses savepoints internally)
├── SingleTransactionCase
└── HttpCase (extends TransactionCase)
```

### TransactionCase

**Purpose**: Each test method runs in a sub-transaction using savepoints. The main transaction is never committed.

**Key Features**:
- Each test method gets its own savepoint
- Data created in `setUpClass()` persists across all test methods
- Each test method rolls back to its savepoint after completion
- Use when you have expensive test data setup common to all tests

```python
from odoo.tests import TransactionCase

class TestMyModel(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Expensive setup done once for all tests
        cls.product = cls.env['product.product'].create({
            'name': 'Test Product',
            'default_code': 'TEST001',
        })

    def test_01_product_exists(self):
        # Can use cls.product
        self.assertTrue(cls.product)
        self.assertEqual(cls.product.name, 'Test Product')

    def test_02_changes_rolled_back(self):
        # Changes from test_01 are rolled back
        self.product.name = 'Modified'
        self.assertEqual(self.product.name, 'Modified')

    def test_03_original_state(self):
        # Product is in original state
        self.assertEqual(self.product.name, 'Test Product')
```

### SingleTransactionCase

**Purpose**: All test methods run in a single transaction that rolls back at the end.

**Key Features**:
- No savepoints between test methods
- Data persists across all test methods
- Faster than TransactionCase (no savepoint overhead)
- Use for fast tests where data isolation isn't critical

```python
from odoo.tests import SingleTransactionCase

class TestFast(SingleTransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.counter = 0

    def test_01_increment(self):
        self.counter += 1
        self.assertEqual(self.counter, 1)

    def test_02_value_persists(self):
        # self.counter persists from test_01
        self.assertEqual(self.counter, 1)
        self.counter += 1
        self.assertEqual(self.counter, 2)
```

**Warning**: Cannot inherit from both TransactionCase and SingleTransactionCase.

### HttpCase

**Purpose**: For HTTP/browser-based testing with headless Chrome support.

**Key Features**:
- Extends TransactionCase
- Provides `url_open()` for HTTP requests
- Provides `browser_js()` for JavaScript testing
- Provides `start_tour()` for tour testing
- Uses Chrome headless browser via WebSocket
- Session management and authentication helpers

```python
from odoo.tests import HttpCase

class TestMyUI(HttpCase):
    def test_http_request(self):
        """Test HTTP endpoint."""
        response = self.url_open('/my/route')
        self.assertEqual(response.status_code, 200)

    def test_browser_js(self):
        """Test JavaScript code."""
        self.browser_js(
            url_path='/web',
            code="console.log('test successful')",
            ready="odoo.isReady",
            login='admin'
        )

    def test_tour(self):
        """Run Odoo tour."""
        self.start_tour(
            url_path='/web',
            tour_name='my_tour_name',
            step_delay=100,
            login='admin'
        )
```

**Browser Configuration**:

```python
class TestMyHttp(HttpCase):
    browser_size = '1920x1080'  # Default: '1366x768'
    touch_enabled = False        # Enable touch events
    allow_end_on_form = False    # Allow ending on form view
```

---

## Test Decorators

### @tagged

Tag test classes or methods for selective execution.

```python
from odoo.tests import tagged

@tagged('-at_install', 'post_install')
class TestMyFeature(TransactionCase):
    """Tests that run after installation."""
    pass

@tagged('slow', 'external')
class TestExternalAPI(TransactionCase):
    """Tests marked as slow and external."""
    pass
```

**Built-in Tags**:
- `standard` - Default tag for regular tests
- `at_install` - Run during module installation (default)
- `post_install` - Run after installation
- `-at_install` - Exclude from at_install
- `-standard` - Remove standard tag

**Tag Selection Syntax**:

```bash
# Run only post_install tests
python odoo-bin --test-tags=post_install

# Run specific test
python odoo-bin --test-tags=post_install:/my_module:TestMyClass.test_method

# Exclude tests
python odoo-bin --test-tags=-slow

# Multiple tags
python odoo-bin --test-tags=post_install,-standard
```

### @users

Run a test method multiple times with different users.

```python
from odoo.tests import users

class TestAccessRights(TransactionCase):
    @users('admin', 'demo', 'portal')
    def test_with_different_users(self):
        """Test runs 3 times, once for each user."""
        # self.uid is automatically switched
        user = self.env.user
        self.assertIn(user.login, ['admin', 'demo', 'portal'])
```

### @warmup

Stabilize query count assertions by running tests twice.

```python
from odoo.tests import warmup

class TestQueryCount(TransactionCase):
    @warmup
    def test_query_count(self):
        """Test runs twice to stabilize query counts."""
        with self.assertQueryCount(5):
            # Some code
            pass
```

### @no_retry

Disable automatic retry on test failure.

```python
from odoo.tests import no_retry

@no_retry
class TestFlaky(TransactionCase):
    """Disable retry for flaky external tests."""
    pass
```

### @standalone

For tests that install/upgrade/uninstall modules (forbidden in regular tests).

```python
from odoo.tests import standalone

@standalone('module_install', 'upgrade')
def test_install_module(self):
    """Can install/uninstall modules here."""
    module = self.env['ir.module.module'].search([('name', '=', 'my_module')])
    module.button_install()
```

### @freeze_time

Freeze time for testing date/time-dependent code.

```python
from odoo.tests.common import freeze_time

# As class decorator
@freeze_time('2024-01-01 12:00:00')
class TestDates(TransactionCase):
    def test_new_year(self):
        from datetime import datetime
        self.assertEqual(fields.Date.today(), '2024-01-01')

# As method decorator
@freeze_time('2024-01-01')
def test_something(self):
    # Time is frozen
    pass

# As context manager
def test_something(self):
    with freeze_time('2024-01-01'):
        # Time is frozen here
        pass
```

---

## Mocking and Patching

### self.patch()

Patch an object attribute with automatic cleanup.

```python
def test_something(self):
    """Patch method with automatic cleanup."""
    def replacement(self):
        return 'mocked value'

    self.patch(MyModel, 'compute_method', replacement)

    record = self.env['my.model'].create({})
    self.assertEqual(record.compute_method(), 'mocked value')

    # Automatically restored after test
```

### self.classPatch()

Class-level patching with cleanup.

```python
@classmethod
def setUpClass(cls):
    super().setUpClass()

    def mock_method(self):
        return 'mocked'

    cls.classPatch(MyModel, 'method', mock_method)
```

### self.startPatcher()

Start a patcher and return the mock.

```python
from unittest.mock import patch

def test_something(self):
    mock_func = self.startPatcher(patch.object(MyModel, 'method'))

    # Returns the mock object
    mock_func.return_value = 'test'

    record = self.env['my.model'].browse(1)
    result = record.method()

    mock_func.assert_called_once()
    self.assertEqual(result, 'test')
```

### Mocking Examples

**Mock external API**:

```python
from unittest.mock import patch

def test_external_api(self):
    """Mock external API calls."""
    with patch('requests.post') as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {'success': True}

        # Code that calls external API
        result = self.env['my.model'].call_external_api()

        mock_post.assert_called_once()
        self.assertTrue(result)
```

**Mock file operations**:

```python
from unittest.mock import mock_open, patch

def test_file_read(self):
    """Mock file reading."""
    with patch('builtins.open', mock_open(read_data='file content')):
        content = self.env['my.model'].read_file('/path/to/file')
        self.assertEqual(content, 'file content')
```

---

## Form Testing

### Basic Form Creation

The `Form` class provides server-side form view simulation with onchange support.

```python
from odoo.tests import Form

# Create mode
with Form(self.env['sale.order']) as f:
    f.partner_id = self.customer
    f.payment_term_id = self.env.ref('account.account_payment_term_15days')
    f.note = 'Test order'

# Automatically saved
order = f.save()
self.assertEqual(order.state, 'draft')

# Edit mode
with Form(order) as f:
    f.note = 'Updated note'

# Automatically saved
self.assertEqual(order.note, 'Updated note')
```

### One2Many Fields

```python
with Form(self.env['sale.order']) as f:
    f.partner_id = self.customer

    # Add new line
    with f.order_line.new() as line:
        line.product_id = self.product
        line.product_uom_qty = 5
        # Onchange is automatically triggered

    # Add another line
    with f.order_line.new() as line:
        line.product_id = self.product2
        line.product_uom_qty = 10

    # Edit existing line (index 0)
    with f.order_line.edit(0) as line:
        line.product_uom_qty = 7

    # Remove line (index 1)
    f.order_line.remove(1)

order = f.save()
self.assertEqual(len(order.order_line), 1)
self.assertEqual(order.order_line[0].product_uom_qty, 7)
```

### Many2Many Fields

```python
# Add/remove/set/clear operations
with Form(user) as f:
    # Add single group
    f.groups_id.add(self.env.ref('account.group_account_manager'))

    # Remove by ID
    f.groups_id.remove(id=self.env.ref('base.group_portal').id)

    # Set multiple groups
    all_groups = self.env['res.groups'].search([])
    f.groups_id.set(all_groups)

    # Clear all
    f.groups_id.clear()
```

### Form Options

```python
# Form with specific view
with Form(self.env['sale.order'], view='sale.order_form') as f:
    pass

# Form with initial values
partner_values = {'name': 'Test Partner'}
with Form(self.env['res.partner'], values=partner_values) as f:
    f.email = 'test@example.com'
```

---

## Browser Testing

### browser_js()

Execute JavaScript in headless Chrome browser.

```python
def test_js_code(self):
    """Test JavaScript code execution."""
    self.browser_js(
        url_path='/web',
        code="""
            console.log('test successful');
            $('body').addClass('test-class');
        """,
        ready="odoo.isReady",
        login='admin',
        timeout=60
    )
```

**Parameters**:
- `url_path` - URL to load
- `code` - JavaScript to execute
- `ready` - JavaScript to wait for before executing code
- `login` - User login (default: None)
- `timeout` - Maximum wait time in seconds (default: 60)
- `cookies` - Dictionary of cookies
- `error_checker` - Function to filter errors
- `watch` - Open visible browser for debugging

### start_tour()

Run Odoo tour (JavaScript tour).

```python
def test_tour(self):
    """Run predefined tour."""
    self.start_tour(
        url_path='/web',
        tour_name='my_tour_name',
        step_delay=100,
        login='admin'
    )
```

### url_open()

Make HTTP requests to the server.

```python
def test_http_request(self):
    """Test HTTP endpoint."""
    # GET request
    response = self.url_open('/my/route')
    self.assertEqual(response.status_code, 200)

    # POST request with data
    response = self.url_open(
        '/my/route',
        data={'key': 'value'},
        method='POST'
    )

    # With authentication
    response = self.url_open(
        '/api/endpoint',
        headers={'Authorization': 'Bearer token'}
    )
```

---

## Setup and Teardown

### setUpClass()

Setup shared test data for all test methods.

```python
@classmethod
def setUpClass(cls):
    super().setUpClass()
    # Create expensive test data once

    cls.partner = cls.env['res.partner'].create({
        'name': 'Test Partner',
        'email': 'test@example.com',
    })

    cls.product = cls.env['product.product'].create({
        'name': 'Test Product',
        'list_price': 100.0,
    })

    cls.warehouse = cls.env.ref('stock.stock_warehouse_main')
```

### setUp()

Setup for each test method.

```python
def setUp(self):
    super().setUp()
    # Setup before each test

    # Register cleanup function
    self.addCleanup(self.cleanup_function)

    # Patch method for this test only
    self.patch(MyModel, 'method', replacement)
```

### tearDown()

Cleanup after each test method.

```python
def tearDown(self):
    # Cleanup after each test
    super().tearDown()
```

### tearDownClass()

Cleanup after all test methods.

```python
@classmethod
def tearDownClass(cls):
    # Cleanup shared resources
    super().tearDownClass()
```

---

## Assert Methods

### assertRecordValues()

Compare recordset with list of dictionaries.

```python
def test_record_values(self):
    partners = self.env['res.partner'].create([
        {'name': 'Partner 1', 'email': 'p1@test.com'},
        {'name': 'Partner 2', 'email': 'p2@test.com'},
    ])

    self.assertRecordValues(
        partners,
        [
            {'name': 'Partner 1', 'email': 'p1@test.com'},
            {'name': 'Partner 2', 'email': 'p2@test.com'},
        ]
    )
```

### assertQueryCount()

Count number of SQL queries executed.

```python
def test_query_count(self):
    """Single user query count."""
    with self.assertQueryCount(5):
        # Code that should execute exactly 5 queries
        partners = self.env['res.partner'].search([])

def test_multi_user_query_count(self):
    """Multi-user query count."""
    with self.assertQueryCount(admin=3, demo=5):
        # admin runs 3 queries, demo runs 5
        pass
```

### assertQueries()

Check exact SQL queries executed.

```python
def test_queries(self):
    with self.assertQueries([
        'SELECT.*FROM res_partner',
        'SELECT.*FROM product_product',
    ]):
        # Code that executes these specific queries
        pass
```

### assertXMLEqual() / assertHTMLEqual()

Compare XML/HTML strings.

```python
def test_xml(self):
    xml1 = '<root><child>text</child></root>'
    xml2 = '<root><child>text</child></root>'
    self.assertXMLEqual(xml1, xml2)
```

### assertURLEqual()

Compare URLs, handling missing scheme/host.

```python
def test_url(self):
    url1 = '/web?action=1'
    url2 = 'http://localhost:8069/web?action=1'
    self.assertURLEqual(url1, url2)
```

### assertTreesEqual()

Compare XML/HTML trees.

```python
def test_tree(self):
    tree1 = etree.fromstring('<root><child>text</child></root>')
    tree2 = etree.fromstring('<root><child>text</child></root>')
    self.assertTreesEqual(tree1, tree2)
```

---

## Test Data Helpers

### new_test_user()

Helper to create test users with proper defaults.

```python
from odoo.tests.common import new_test_user

def test_with_user(self):
    """Create test user with groups."""
    user = new_test_user(
        self.env,
        login='testuser',
        groups='base.group_user,base.group_portal',
        company_id=self.main_company.id,
        name='Test User'
    )

    # Test with user
    records = self.env['my.model'].sudo(user).search([])
```

### RecordCapturer

Capture records created during a test.

```python
from odoo.tests.common import RecordCapturer

def test_capture_records(self):
    """Capture records matching domain."""
    with RecordCapturer(
        self.env['res.partner'],
        [('name', '=', 'test')]
    ) as capturer:
        # Create partners
        self.env['res.partner'].create({'name': 'test'})
        self.env['res.partner'].create({'name': 'test2'})
        self.env['res.partner'].create({'name': 'other'})

    # Only 'test' partner captured
    self.assertEqual(len(capturer.records), 1)
```

---

## Running Tests

### Command-Line Options

```bash
# Run all tests
python odoo-bin -d test_db --test-enable

# Run specific module
python odoo-bin -d test_db --test-enable --test-tags=my_module

# Run post_install tests only
python odoo-bin -d test_db --test-enable --test-tags=post_install

# Run specific test
python odoo-bin -d test_db --test-enable --test-tags=post_install/my_module:TestClass.test_method

# Exclude tests
python odoo-bin -d test_db --test-enable --test-tags=-slow

# Stop after N failures
export ODOO_TEST_MAX_FAILED_TESTS=5

# Enable logging
python odoo-bin --log-level=debug --test-enable
```

### Test Tags Selector

```bash
# Include specific tag
--test-tags=post_install

# Exclude tag
--test-tags=-slow

# Specific module
--test-tags=post_install/my_module

# Specific class
--test-tags=post_install/my_module:TestClass

# Specific method
--test-tags=post_install/my_module:TestClass.test_method

# Multiple filters
--test-tags=post_install,-slow

# Complex filtering
--test-tags='post_install and not slow'
```

### Testing Individual Modules

```bash
# Test specific addon
python odoo-bin -d test_db --test-enable --init=my_module

# Test after update
python odoo-bin -d test_db --test-enable --update=my_module

# Test multiple modules
python odoo-bin -d test_db --test-enable --init=my_module,other_module
```

---

## Best Practices

### 1. Use Appropriate Test Case

```python
# Use TransactionCase for most tests
class TestFeature(TransactionCase):
    """Tests with isolated data per method."""
    pass

# Use HttpCase for browser/JS testing
class TestUI(HttpCase):
    """Tests for UI components."""
    pass

# Use SingleTransactionCase for fast, non-isolated tests
class TestFast(SingleTransactionCase):
    """Fast tests without data isolation."""
    pass
```

### 2. Tag Tests Properly

```python
# Browser tests should be post_install
@tagged('-at_install', 'post_install')
class TestUI(HttpCase):
    pass

# Mark slow tests
@tagged('slow')
class TestHeavyComputation(TransactionCase):
    pass

# Mark external API tests
@tagged('external', 'slow')
class TestExternalAPI(TransactionCase):
    pass
```

### 3. Use Context Managers for Cleanup

```python
def test_something(self):
    """Automatic cleanup with context manager."""
    with self.patch(Model, 'method', replacement):
        # Test code
        pass
    # Automatically cleaned up
```

### 4. Use Form for UI-like Testing

```python
def test_create_record(self):
    """Test with form simulation."""
    with Form(self.env['sale.order']) as f:
        f.partner_id = self.partner
        with f.order_line.new() as line:
            line.product_id = self.product

    # Automatically saved and onchange triggered
    order = f.save()
    self.assertTrue(order.order_line)
```

### 5. Test with Multiple Users

```python
@users('admin', 'portal')
def test_access_rights(self):
    """Test runs for both users."""
    records = self.env['my.model'].search([])
    # Test with different access rights
```

### 6. Use subTest for Multiple Cases

```python
def test_multiple_cases(self):
    """Test multiple scenarios with subTest."""
    for value, expected in [(1, 2), (2, 4), (3, 6)]:
        with self.subTest(value=value):
            self.assertEqual(value * 2, expected)
```

### 7. Use addCleanup for Resources

```python
def test_with_resource(self):
    """Automatic cleanup with addCleanup."""
    import tempfile
    import os

    temp_file = tempfile.mktemp()
    self.addCleanup(os.remove, temp_file)

    # Use temp_file
    with open(temp_file, 'w') as f:
        f.write('test')
```

### 8. Mock External Dependencies

```python
def test_external_api(self):
    """Mock external API calls."""
    with patch('requests.post') as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {'success': True}

        # Test code that calls external API
        result = self.env['my.model'].call_external_api()

        mock_post.assert_called_once()
        self.assertTrue(result)
```

### 9. setUpClass for Expensive Setup

```python
@classmethod
def setUpClass(cls):
    super().setUpClass()
    # Create expensive test data once

    cls.warehouse = cls.env.ref('stock.stock_warehouse_main')
    cls.location = cls.warehouse.lot_stock_id

    # Create many records at once
    cls.products = cls.env['product.product'].create([
        {'name': f'Product {i}'} for i in range(100)
    ])
```

### 10. Use freeze_time for Date-Dependent Tests

```python
@freeze_time('2024-01-01')
def test_year_end(self):
    """Test with frozen time."""
    from datetime import date
    self.assertEqual(fields.Date.today(), date(2024, 1, 1))
```

### 11. Test Error Cases

```python
def test_validation_error(self):
    """Test that validation errors are raised."""
    with self.assertRaises(ValidationError):
        self.env['res.partner'].create({'name': None})

def test_access_error(self):
    """Test that access errors are raised."""
    user = new_test_user(self.env, login='test')
    with self.assertRaises(AccessError):
        self.env['mail.channel'].sudo(user).search([])
```

### 12. Test Onchange Behavior

```python
def test_onchange(self):
    """Test onchange behavior with Form."""
    partner = self.env['res.partner'].create({'name': 'Test'})

    with Form(self.env['sale.order']) as f:
        f.partner_id = partner
        # Onchange automatically triggered
        self.assertEqual(f.payment_term_id, partner.property_payment_term_id)
```

---

## Additional Resources

### Key Files Reference

| File Path | Purpose |
|-----------|---------|
| `/odoo/tests/common.py` | Base test classes and utilities |
| `/odoo/tests/form.py` | Form testing utility |
| `/odoo/tests/case.py` | Core TestCase implementation |
| `/odoo/tests/loader.py` | Test loading and discovery |
| `/odoo/tests/tag_selector.py` | Tag-based test filtering |
| `/addons/base/tests/common.py` | Base module test helpers |

### Quick Test Template

```python
from odoo.tests import TransactionCase, tagged

@tagged('-at_install', 'post_install')
class TestMyModel(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.record = cls.env['my.model'].create({
            'name': 'Test',
        })

    def test_01_basic(self):
        """Test basic functionality."""
        self.assertEqual(self.record.name, 'Test')

    def test_02_method(self):
        """Test method behavior."""
        result = self.record.my_method()
        self.assertTrue(result)
```


---

---
name: odoo-18-transaction
description: Complete guide for handling database transactions, UniqueViolation errors, savepoints, and commit operations in Odoo 18.
globs: "**/*.{py,xml}"
topics:
  - Transaction states and error handling
  - UniqueViolation (duplicate key) errors
  - Savepoint usage patterns
  - commit() and rollback() best practices
  - InFailedSqlTransaction errors
  - Serialization errors
when_to_use:
  - Handling duplicate key errors
  - Working with savepoints for error isolation
  - Understanding transaction abort states
  - Preventing serialization conflicts
---

# Odoo 18 Transaction Guide

Complete guide for handling database transactions, UniqueViolation errors, savepoints, and commit operations in Odoo 18.

## Table of Contents

1. [Transaction States](#transaction-states)
2. [UniqueViolation Errors](#uniqueviolation-errors)
3. [Savepoint Usage](#savepoint-usage)
4. [commit() and rollback()](#commit-and-rollback)
5. [Transaction Aborted Errors](#transaction-aborted-errors)
6. [Serialization Errors](#serialization-errors)

---

## Transaction States

### PostgreSQL Transaction Isolation

Odoo uses `REPEATABLE READ` isolation level by default (defined in `odoo/sql_db.py:303`):

```python
# From odoo/sql_db.py
class Cursor(BaseCursor):
    def __init__(self, pool, dbname, dsn):
        # ...
        self.connection.set_isolation_level(ISOLATION_LEVEL_REPEATABLE_READ)
        self.connection.set_session(readonly=pool.readonly)
```

**What this means**:
- Transactions operate on snapshots taken at the first query
- Concurrent updates are detected and may cause serialization errors
- Changes from other transactions are not visible during your transaction

### Transaction State Flow

```
Normal → [Error] → Aborted → [rollback] → Normal
                    ↓
                 [commit] → ERROR! (cannot commit aborted transaction)
```

**Key Point**: Once a transaction enters the "aborted" state due to an error, **all subsequent commands will fail** until you execute `ROLLBACK`.

---

## UniqueViolation Errors

### What is UniqueViolation?

PostgreSQL error code `23505` (UniqueViolation) occurs when inserting or updating data violates a unique constraint.

```python
# Example: Trying to create a duplicate record
existing = self.create({'email': 'test@example.com'})

# This will raise UniqueViolation (psycopg2.errors.UniqueViolation)
duplicate = self.create({'email': 'test@example.com'})
```

### Odoo's Error Handling

Odoo maps PostgreSQL errors to user-friendly messages via `PGERROR_TO_OE` (defined in `odoo/models.py:7618`):

```python
PGERROR_TO_OE = defaultdict(
    lambda: (lambda model, fvg, info, pgerror: {'message': tools.exception_to_unicode(pgerror)}),
    {
        '23502': convert_pgerror_not_null,   # NOT NULL violation
        '23505': convert_pgerror_unique,     # UNIQUE violation
        '23514': convert_pgerror_constraint, # CHECK constraint violation
    },
)
```

### UniqueViolation Error Handler

From `odoo/models.py:7564`, Odoo handles unique violations by:

```python
def convert_pgerror_unique(model, fields, info, e):
    # Uses a NEW cursor because we're in a blown transaction
    with closing(model.env.registry.cursor()) as cr_tmp:
        cr_tmp.execute(SQL("""
            SELECT conname, t.relname, ARRAY(
                SELECT attname FROM pg_attribute
                WHERE attrelid = conrelid AND attnum = ANY(conkey)
            ) as "columns"
            FROM pg_constraint
            JOIN pg_class t ON t.oid = conrelid
            WHERE conname = %s
        """, e.diag.constraint_name))
        constraint, table, ufields = cr_tmp.fetchone() or (None, None, None)
```

**Why a new cursor?** The current transaction is in "aborted" state after the error. A new cursor creates a fresh transaction for the error handler.

### Handling UniqueViolation Correctly

```python
# BAD: Direct exception handling without transaction cleanup
try:
    record = self.create({'email': email})
except psycopg2.errors.UniqueViolation:
    # Transaction is now ABORTED - cannot execute queries!
    existing = self.search([('email', '=', email)])  # ERROR!

# GOOD: Use savepoint to isolate the error
with self.env.cr.savepoint():
    try:
        record = self.create({'email': email})
    except psycopg2.errors.UniqueViolation:
        # Savepoint rolled back, transaction still valid
        pass  # Now we can continue

# GOOD: Check for existence first
existing = self.search([('email', '=', email)], limit=1)
if not existing:
    record = self.create({'email': email})
```

---

## Savepoint Usage

### What is a Savepoint?

A savepoint creates a nested transaction that can be rolled back without affecting the outer transaction.

```python
# From odoo/sql_db.py:79
class Savepoint:
    """ Reifies an active breakpoint, allows users to internally rollback
    the savepoint without having to implement their own savepointing.
    """
    def __init__(self, cr):
        self.name = str(uuid.uuid1())
        self._cr = cr
        cr.execute('SAVEPOINT "%s"' % self.name)

    def rollback(self):
        self._cr.execute('ROLLBACK TO SAVEPOINT "%s"' % self.name)

    def _close(self, rollback):
        if rollback:
            self.rollback()
        self._cr.execute('RELEASE SAVEPOINT "%s"' % self.name)
```

### Basic Savepoint Pattern

```python
# Savepoint context manager
with self.env.cr.savepoint():
    # Any error here rolls back to the savepoint
    record = self.create({'name': 'test'})
    raise ValueError("This will be rolled back")
# Transaction continues normally after the savepoint
```

### Flushing Savepoint vs Non-Flushing

Odoo provides two types of savepoints:

```python
# From odoo/sql_db.py:182
def savepoint(self, flush=True) -> Savepoint:
    if flush:
        return _FlushingSavepoint(self)  # Auto-flushes ORM cache
    else:
        return Savepoint(self)          # No flush
```

**`flush=True` (default)**: Flushes ORM changes before entering savepoint
```python
with self.env.cr.savepoint():  # Equivalent to flush=True
    # All pending ORM changes are written to DB first
    # Useful when your operation needs to see latest data
```

**`flush=False`**: Does NOT flush - changes remain in cache
```python
with self.env.cr.savepoint(flush=False):
    # Changes remain in memory, not written yet
    # Useful for schema operations in odoo/tools/sql.py
```

### _FlushingSavepoint Behavior

```python
# From odoo/sql_db.py:123
class _FlushingSavepoint(Savepoint):
    def __init__(self, cr):
        cr.flush()  # Flush ORM cache before creating savepoint
        super().__init__(cr)

    def rollback(self):
        self._cr.clear()  # Clear ORM cache on rollback
        super().rollback()

    def _close(self, rollback):
        try:
            if not rollback:
                self._cr.flush()  # Final flush on success
        except Exception:
            rollback = True
            raise
        finally:
            super()._close(rollback)
```

### Batch Operation Pattern with Savepoints

```python
# GOOD: Each record isolated with savepoint
for data in data_list:
    with self.env.cr.savepoint():
        record = self.create(data)
        record._process()

# If one fails, others continue
```

### Common Savepoint Anti-Patterns

```python
# BAD: Re-using savepoint name
name = 'my_savepoint'
self.env.cr.execute(f'SAVEPOINT "{name}"')
# ... do work ...
self.env.cr.execute(f'RELEASE SAVEPOINT "{name}"')
self.env.cr.execute(f'SAVEPOINT "{name}"')  # ERROR: savepoint already exists

# GOOD: Use context manager (auto-generates unique name)
with self.env.cr.savepoint():
    # ... do work ...

# BAD: Nested savepoint after error
try:
    with self.env.cr.savepoint():
        raise UniqueViolation("boom")
except UniqueViolation:
    pass  # Transaction might be in bad state
with self.env.cr.savepoint():  # May fail if outer transaction aborted
    # ...
```

---

## commit() and rollback()

### When to Use commit()

**WARNING**: Manual `commit()` is rarely needed in Odoo!

```python
# From odoo/sql_db.py:487
def commit(self):
    """ Perform an SQL `COMMIT` """
    self.flush()
    result = self._cnx.commit()
    self.clear()
    self._now = None
    self.prerollback.clear()
    self.postrollback.clear()
    self.postcommit.run()
    return result
```

Odoo automatically commits at the end of HTTP requests. Only use manual commit for:

1. **Long-running batch jobs** (to release locks periodically)
2. **Multi-transaction operations** (cron jobs, data imports)

```python
# GOOD: Batch commit for long operations
def process_large_dataset(self):
    records = self.search([])
    batch_size = 100
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        batch.write({'processed': True})
        self.env.cr.commit()  # Commit progress
```

### When NOT to Use commit()

```python
# BAD: Commit inside normal business logic
@api.model
def create_order(self, values):
    order = self.create(values)
    self.env.cr.commit()  # DON'T DO THIS!
    order.action_confirm()  # If this fails, order is already committed!
```

### rollback() Usage

```python
# From odoo/sql_db.py:498
def rollback(self):
    """ Perform an SQL `ROLLBACK` """
    self.clear()
    self.postcommit.clear()
    self.prerollback.run()
    result = self._cnx.rollback()
    self._now = None
    self.postrollback.run()
    return result
```

**When to use rollback**:
- After catching critical errors in cron jobs
- In test cleanup
- In multi-phase operations where you want to undo everything

```python
# GOOD: Rollback on error in batch operation
def batch_import(self, data_list):
    try:
        for data in data_list:
            self.create(data)
        self.env.cr.commit()
    except Exception as e:
        self.env.cr.rollback()
        _logger.error("Import failed, rolled back: %s", e)
```

### Cursor as Context Manager

```python
# From odoo/sql_db.py:193
def __enter__(self):
    return self

def __exit__(self, exc_type, exc_value, traceback):
    try:
        if exc_type is None:
            self.commit()
    finally:
        self.close()

# Usage
with self.env.registry.cursor() as cr:
    cr.execute("SELECT ...")
    # Auto-commits on success, auto-rolls back on error
```

---

## Transaction Aborted Errors

### InFailedSqlTransaction

After any database error, PostgreSQL enters an "aborted transaction" state:

```python
# ERROR: current transaction is aborted, commands ignored until end of transaction block
```

### Why This Happens

```
1. Transaction starts
2. Query executes → ERROR (UniqueViolation, etc.)
3. Transaction state → ABORTED
4. Any subsequent query → InFailedSqlTransaction ERROR
5. Must ROLLBACK to return to normal state
```

### Proper Error Recovery

```python
# BAD: Continuing after error without cleanup
try:
    record = self.create({'email': 'duplicate@email.com'})
except psycopg2.errors.UniqueViolation:
    pass  # Transaction is now ABORTED
record = self.create({'email': 'another@email.com'})  # FAILS! InFailedSqlTransaction

# GOOD: Use savepoint for isolation
with self.env.cr.savepoint():
    try:
        record = self.create({'email': 'duplicate@email.com'})
    except psycopg2.errors.UniqueViolation:
        pass  # Savepoint rolled back, transaction OK
# This now works:
record = self.create({'email': 'another@email.com'})

# GOOD: Use context manager for operations that might fail
def safe_create(self, values):
    with self.env.cr.savepoint():
        return self.create(values)
```

### Nested Savepoints and Transaction State

```python
# Outer transaction
with self.env.cr.savepoint():  # Savepoint A
    # Inner savepoint
    with self.env.cr.savepoint():  # Savepoint B
        raise UniqueViolation("boom")
    # B rolled back, A still active, transaction OK

# All good - both savepoints released, no commit
```

---

## Serialization Errors

### What is Serialization Error?

PostgreSQL error code `40001` (serialization_error) occurs when concurrent transactions conflict:

```
ERROR: could not serialize access due to concurrent update
```

### Common Causes

1. **Concurrent updates on same records**
2. **Multiple workers processing same account** (common in cron jobs)

### Detection Pattern

```python
# From logs - same IDs with identical timestamps confirm concurrent processing
2026-01-20 02:45:54.198378 UPDATE fb_daily_expense SET ... WHERE id IN (3807, 3808, ...)
2026-01-20 02:45:54.198378 UPDATE fb_daily_expense SET ... WHERE id IN (3807, 3808, ...)
# → Serialization error: two workers updating same records
```

### Solution: Record Locking with FOR UPDATE NOWAIT

**This is the standard Odoo pattern** (used in base modules like `ir_sequence`, `account_edi`, etc.):

```python
from psycopg2.errors import LockNotAvailable

def process_record_safe(self, record):
    """Process record with locking to prevent concurrent processing."""
    try:
        # Try to acquire lock on the record - raises LockNotAvailable if locked
        with self.env.cr.savepoint(flush=False):
            self.env.cr.execute(
                'SELECT * FROM %s WHERE id = %%s FOR UPDATE NOWAIT' % self._table,
                [record.id]
            )
    except LockNotAvailable:
        # Another transaction is processing this record
        _logger.info("Record %s already being processed, skipping", record.id)
        return False

    # We have the lock - safe to process
    # ... process the record ...
    return True
```

**Key points**:
- `FOR UPDATE NOWAIT` - immediately raises `LockNotAvailable` if record is locked
- `savepoint(flush=False)` - prevents cache flush before lock attempt
- This pattern is used throughout Odoo base code for concurrency control

### Batch Processing with Record Locking

```python
from psycopg2.errors import LockNotAvailable

def batch_process_records(self, records):
    """Process multiple records, skipping locked ones."""
    processed = 0
    skipped = 0

    for record in records:
        try:
            with self.env.cr.savepoint(flush=False):
                # Lock this specific record
                self.env.cr.execute(
                    'SELECT * FROM %s WHERE id IN %%s FOR UPDATE NOWAIT' % self._table,
                    [tuple(record.ids)]
                )

            # Record is locked - process it
            record._do_process()
            processed += 1

        except LockNotAvailable:
            # Record is locked by another transaction - skip
            _logger.debug("Record %s locked, skipping", record.id)
            skipped += 1
            continue

    return {'processed': processed, 'skipped': skipped}
```

### Alternative: Identity-Based Deduplication

For queue jobs, use `identity_key` to prevent duplicates:

```python
# With queue jobs
from odoo.addons.queue_job.job import job

@job(identity_key='{{account_id}}_{{date}}')
def fetch_daily_expenses(self, account_id, date):
    # Only one job per account+date combination
    pass
```

### Batch Updates to Minimize Conflicts

```python
# BAD: Update in loop - each update is a serialization point
for record in records:
    record.write({'amount': computed_amount})

# GOOD: Group identical values, single update
from collections import defaultdict
value_groups = defaultdict(list)
for record, amount in zip(records, amounts):
    value_groups[amount].append(record.id)

for amount, ids in value_groups.items():
    self.env.cr.execute(
        "UPDATE fb_daily_expense SET amount = %s WHERE id IN %s",
        (amount, tuple(ids))
    )
```

---

## Quick Reference

### PostgreSQL Error Codes

| Code | Name | Odoo Handler |
|------|------|--------------|
| 23502 | NOT NULL violation | `convert_pgerror_not_null` |
| 23505 | UNIQUE violation | `convert_pgerror_unique` |
| 23514 | CHECK violation | `convert_pgerror_constraint` |
| 40001 | Serialization failure | Must retry with retry_on_serializable=True |
| 25P02 | InFailedSqlTransaction | Must rollback |
| 55P03 | LockNotAvailable | Record locked by another transaction |

### Locking Decision Tree

```
Need concurrency control?
├── Record-level locking → SELECT ... FOR UPDATE NOWAIT
│   ├── Prevent concurrent processing of same record
│   ├── Use savepoint(flush=False) before SELECT
│   └── Catch LockNotAvailable exception
├── Job deduplication → identity_key (queue_job)
│   └── Only one job per unique key
└── Batch processing → Group identical values
    └── Minimize serialization conflicts
```

### Savepoint Decision Tree

```
Need error isolation?
├── Single operation that might fail → savepoint()
├── Batch operation with individual failures → Loop with savepoint()
├── Schema operation (ddl) → savepoint(flush=False)
└── Import/data loading → savepoint() with exception handling

Need flush control?
├── Need latest data in savepoint → savepoint(flush=True) [default]
└── Avoid cache invalidation → savepoint(flush=False)
```

### Transaction Recovery Checklist

After catching a database error:

- [ ] Am I using a savepoint? If yes, transaction is fine
- [ ] Do I need to execute more queries? If yes, use savepoint next time
- [ ] Should I rollback the entire transaction?
- [ ] Should I retry the operation?

### Best Practices

1. **Always use `with cr.savepoint()`** for operations that might fail
2. **Never commit() mid-business-logic** unless you know why
3. **Check for duplicates before creating** rather than catching UniqueViolation
4. **Use `SELECT ... FOR UPDATE NOWAIT`** for cron jobs that might process same records
5. **Use `identity_key`** for queue job deduplication
6. **Group identical updates** to minimize serialization conflicts
7. **Flush before SQL queries** using `self.flush_model()` or SQL.to_flush

---

## Common Patterns Reference

### Pattern 1: Safe Batch Create with Error Isolation

```python
@api.model
def batch_create_safe(self, records_data):
    """Create records, continuing on individual failures"""
    created = []
    failed = []

    for data in records_data:
        with self.env.cr.savepoint():
            try:
                record = self.create(data)
                created.append(record)
            except (psycopg2.Error, ValidationError) as e:
                failed.append({'data': data, 'error': str(e)})

    return created, failed
```

### Pattern 2: Upsert (Update or Insert)

```python
@api.model
def upsert_by_key(self, key_field, key_value, values):
    """Update if exists, insert if not"""
    existing = self.search([(key_field, '=', key_value)], limit=1)
    if existing:
        existing.write(values)
        return existing
    return self.create({key_field: key_value, **values})
```

### Pattern 3: Record Locking (Odoo Standard Pattern)

This is the **standard Odoo pattern** for preventing concurrent record processing:

```python
from psycopg2.errors import LockNotAvailable

def process_with_lock(self, records):
    """Process records, skipping those locked by other transactions."""
    for record in records:
        try:
            # Try to acquire exclusive lock on this record
            with self.env.cr.savepoint(flush=False):
                self.env.cr.execute(
                    'SELECT * FROM %s WHERE id IN %%s FOR UPDATE NOWAIT' % self._table,
                    [tuple(record.ids)]
                )
        except LockNotAvailable:
            # Record is being processed by another transaction
            _logger.info("Record %s locked, skipping", record.id)
            continue

        # We have the lock - safe to process
        record._do_process()
```

**Key points**:
- Used throughout Odoo base code (`ir_sequence`, `account_edi`, etc.)
- `FOR UPDATE NOWAIT` - immediately raises `LockNotAvailable` if locked
- `savepoint(flush=False)` - prevents cache flush before lock
- No wait time - immediately fails if record is locked

### Pattern 4: Retry on Serialization Error

```python
from odoo import tools

@api.model
def update_with_retry(self, records, values, max_retries=3):
    """Retry update on serialization error"""
    for attempt in range(max_retries):
        try:
            return records.write(values)
        except psycopg2.errors.SerializationError:
            if attempt == max_retries - 1:
                raise
            tools.config['test_enable'] = False  # Avoid test mode issues
            self.env.cr.rollback()
            self._cr.execute("SELECT 1")  # Reset transaction state
```

### Pattern 5: Flush Before SQL Query

```python
from odoo.tools import SQL

@api.model
def get_aggregated_data(self):
    """Flush ORM changes before direct SQL"""
    # Flush pending ORM changes
    self.flush_model(['state', 'amount'])

    query = SQL("""
        SELECT state, SUM(amount) as total
        FROM %s
        WHERE state IN %s
        GROUP BY state
    """, SQL.identifier(self._table), ('done', 'cancel'))

    self.env.cr.execute(query)
    return dict(self.env.cr.fetchall())
```

---

## Sources

- `odoo/sql_db.py` - Cursor, Savepoint, Connection classes
- `odoo/models.py:7564` - `convert_pgerror_unique()`
- `odoo/models.py:7618` - `PGERROR_TO_OE` mapping
- `odoo/tools/sql.py` - Schema operations with savepoints
- `odoo/addons/base/models/ir_sequence.py:57` - `FOR UPDATE NOWAIT` pattern
- `odoo/addons/account_edi/models/account_edi_document.py:229` - `FOR UPDATE NOWAIT` pattern
- `odoo/addons/website_sale/controllers/payment.py:47` - `LockNotAvailable` handling
- PostgreSQL Documentation: Transaction Isolation, Error Codes


---

---
name: odoo-18-translation
description: Complete guide for Odoo 18 translations and localization. Covers Python translations with _() and _lt(), JavaScript/OWL translations with _t(), QWeb template translations, field translations with translate=True, PO file structure, translation export/import, language management, and translation term loading.
globs: "**/*.{py,js,xml}"
topics:
  - Python translations (_ and _lt)
  - JavaScript translations (_t)
  - QWeb template translations
  - Field translations (translate=True)
  - PO file structure
  - Translation export/import
when_to_use:
  - Adding translatable strings to Python code
  - Adding translations to JavaScript/OWL components
  - Creating translatable QWeb templates
  - Setting up translated fields
  - Exporting/importing translations
---

# Odoo 18 Translation & Localization Guide

Complete guide for translating and localizing Odoo 18 modules.

## Quick Reference

| Context | Function | Example |
|---------|----------|---------|
| Python code | `_()` | `_("Hello World")` |
| Python module constants | `_lt()` | `TITLE = _lt("Module Title")` |
| JavaScript/OWL | `_t()` | `_t("Hello World")` |
| Field definition | `translate=True` | `name = fields.Char(translate=True)` |

---

## Table of Contents

1. [Python Translations](#python-translations)
2. [Field Translations](#field-translations)
3. [QWeb Template Translations](#qweb-template-translations)
4. [JavaScript/OWL Translations](#javascriptowl-translations)
5. [Module Translation Structure](#module-translation-structure)
6. [Translation Export/Import](#translation-exportimport)
7. [Language Management](#language-management)
8. [Translation Types](#translation-types)
9. [Best Practices](#best-practices)
10. [Anti-Patterns](#anti-patterns)

---

## Python Translations

### Standard Translation Function

**File:** `odoo/tools/translate.py`

```python
from odoo.tools.translate import _

# Simple translation
message = _("Hello World")

# With formatting (positional)
message = _("Hello %s", user.name)

# With formatting (named)
message = _("Hello %(name)s, you have %(count)d messages",
            name=user.name, count=5)
```

### Lazy Translation (Module Constants)

For module-level constants that should be translated lazily:

```python
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)

# Module-level constants
MODULE_NAME = _lt("My Module Name")
TITLE_USER = _lt("User")
LABEL_CONFIRM = _lt("Confirm")

# Usage later - translation happens at display time
def get_title(self):
    return MODULE_NAME  # Translated when displayed
```

**When to use `_lt()`:**
- Module-level constants
- Class-level attributes
- Default values for fields
- Any string defined outside of methods

### Translation with Context

Provide context for translators using comments:

```python
# Button label (verb)
_(_t("Export"))

# File format (noun)
_("CSV")

# For ambiguous terms, add context
_("Delete", context="verb")  # To remove something
_("Delete", context="noun")  # A deletion record
```

---

## Field Translations

### Simple Field Translation

```python
class MyModel(models.Model):
    _name = 'my.model'
    _description = 'My Model'

    # Entire field value is translated
    name = fields.Char(string='Name', translate=True)
    description = fields.Text(string='Description', translate=True)
    notes = fields.Html(string='Notes', translate=html_translate)
```

**Storage:** Translations stored as JSONB in database:
```json
{
    "en_US": "Product",
    "fr_FR": "Produit",
    "es_ES": "Producto"
}
```

### Field Labels and Help

Field `string` and `help` attributes are automatically translatable:

```python
# These are automatically extracted for translation
status = fields.Selection([
    ('draft', 'Draft'),
    ('confirmed', 'Confirmed'),
    ('done', 'Done'),
], string='Status', help='Document status')
```

### Term-by-Term Translation

For HTML/XML content with translatable terms inside:

```python
from odoo.tools.translate import html_translate

# Each translatable term is translated separately
description = fields.Html(
    'Description',
    translate=html_translate
)
```

### Accessing Field Translations

```python
# Get translations for a specific field
translations, context = record.get_field_translations('name')
# Returns: [{'lang': 'fr_FR', 'source': 'Name', 'value': 'Nom'}, ...]

# Update field translations
record._update_field_translations('name', {
    'fr_FR': 'Nom',
    'es_ES': 'Nombre'
})
```

---

## QWeb Template Translations

### Translatable Content

**File:** `odoo/tools/translate.py` (Lines 153-196)

**Translatable Elements:** `span`, `div`, `p`, `h1`-`h6`, `button`, `b`, `i`, `strong`, `em`, `small`, `text`, `option`, etc.

**Translatable Attributes:** `string`, `placeholder`, `title`, `alt`, `help`, `confirm`, `aria-label`, `data-tooltip`, etc.

### Basic QWeb Translation

```xml
<template xml:space="preserve">
    <!-- Text content is automatically translatable -->
    <div>
        <p>This text will be extracted for translation</p>
        <h2>Welcome to Odoo</h2>
    </div>

    <!-- Using JavaScript _t in templates -->
    <span t-esc="_t('Translate me')"/>

    <!-- String attributes are translatable -->
    <button string="Click Me"/>
    <field name="name" string="Name" placeholder="Enter name"/>

    <!-- Help text -->
    <field name="email" help="Email address for notifications"/>
</template>
```

### Disable Translation

```xml
<!-- Disable translation for specific content -->
<span class="fa fa-warning" t-translation="off">&nbsp;</span>

<!-- Code/technical content -->
<code t-translation="off">user_id</code>
```

### QWeb with Formatting

```xml
<!-- Variables are NOT translated -->
<div>
    Hello <t t-esc="user.name"/>,
    you have <t t-esc="message_count"/> new messages.
</div>

<!-- For mixed content, split into translatable parts -->
<div>
    <t t-esc="_t('Hello %(name)s', name=user.name)"/>
    <t t-esc="_t('You have %(count)d messages', count=message_count)"/>
</div>
```

### Translatable Attributes

```xml
<!-- All these attributes are automatically translatable -->
<button string="Save" confirm="Are you sure?"/>
<field name="email" placeholder="email@example.com"/>
<span class="fa fa-info-circle"
      title="Information"
      data-tooltip="More details"/>
<input aria-label="Search"/>
```

### OWL Component Attributes

```xml
<!-- OWL components with .translate suffix -->
<Component title.translate="Some title"/>
<button label.translate="Click me"/>
```

---

## JavaScript/OWL Translations

### Translation Function

**File:** `addons/web/static/src/core/l10n/translation.js`

```javascript
import { _t } from "@web/core/l10n/translation";

// Simple translation
const message = _t("Good morning");

// With positional argument
const msg = _t("Good morning %s", userName);

// With named arguments
const formatted = _t("Hello %(name)s, you have %(count)d new messages", {
    name: user.name,
    count: messageCount
});
```

### In OWL Components

```javascript
/** @odoo-module **/
import { Component, useState } from "@owl/swidget";
import { _t } from "@web/core/l10n/translation";

class MyComponent extends Component {
    static template = "my_module.MyComponent";

    setup() {
        this.state = useState({
            title: _t("My Component Title"),
            message: _t("Loading...")
        });
    }

    showMessage() {
        this.displayNotification({
            message: _t("Operation completed successfully"),
            type: 'success',
        });
    }
}
```

### Lazy Translations

```javascript
// Translation happens when the value is converted to string
const lazyText = new LazyTranslatedString("Hello", []);

// Later...
console.log(`${lazyText}`); // Translated at this point
```

### Translation with Markup

```javascript
import { markup } from "@odoo/owl";

// HTML-safe markup in translations
const message = _t("I love %s", markup("<b>Odoo</b>"));
// Result: "I love <b>Odoo</b>" (HTML preserved)
```

---

## Module Translation Structure

### Directory Structure

```
my_module/
├── i18n/
│   ├── my_module.pot       # Template (source strings)
│   ├── fr.po              # French translations
│   ├── de.po              # German translations
│   ├── vi.po              # Vietnamese translations
│   └── i18n_extra/        # Optional additional translations
│       └── fr_BE.po       # Belgian French override
├── models/
│   └── my_model.py        # Python with _("text")
├── static/
│   └── src/
│       ├── js/
│       │   └── my_script.js    # JS with _t("text")
│       └── xml/
│           └── my_template.xml # QWeb templates
```

### PO File Format

**Example:** `i18n/fr.po`

```po
# Translation of Odoo Server
# This file contains the French translations
msgid ""
msgstr ""
"Project-Id-Version: Odoo Server 18.0
"
"Report-Msgid-Bugs-To: 
"
"POT-Creation-Date: 2024-01-01 12:00+0000
"
"PO-Revision-Date: 2024-01-01 12:00+0000
"
"Last-Translator: 
"
"Language-Team: 
"
"Language: fr_FR
"
"MIME-Version: 1.0
"
"Content-Type: text/plain; charset=UTF-8
"
"Content-Transfer-Encoding: 8bit
"

#. module: my_module
#. odoo-python
#: code:addons/my_module/models/my_model.py:45
msgid "Code Lazy, English"
msgstr "Code Lazy, Français"

#. module: my_module
#: model:ir.model.fields,field_description:my_module.field_my_model__name
msgid "Name"
msgstr "Nom"

#. module: my_module
#. odoo-javascript
#: static/src/js/my_script.js:23
msgid "Save"
msgstr "Enregistrer"

#. module: my_module
#: model:ir.model,name:model_my_model
msgid "My Model"
msgstr "Mon Modèle"
```

### Translation Comments

```po
#. odoo-python       # Python code translation (_() or _lt())
#. odoo-javascript    # JavaScript translation (_t())
# model:ir.model,name:model_my_model
# model:ir.ui.view,view_id:view_my_form
```

### Language Fallback

Odoo automatically falls back through language variants:

```
fr_BE (Belgian French)
  ↓ (not found)
fr_419 (French generic)
  ↓ (not found)
fr (French base)
  ↓ (not found)
en_US (English - default)
```

---

## Translation Export/Import

### Export Translations via UI

1. Go to **Settings** → **Translations** → **Export Terms**
2. Select language
3. Choose format: PO, CSV, or TGZ
4. Select modules to export
5. Download file

### Export Translations via Code

```python
# File: odoo/tools/translate.py
from odoo.tools.translate import trans_export

import io

buffer = io.BytesIO()
trans_export(
    lang='fr_FR',
    modules=['my_module'],
    buffer=buffer,
    format='po',
    cr=self.env.cr
)

# Save to file
with open('/tmp/my_module-fr.po', 'wb') as f:
    f.write(buffer.getvalue())
```

### Import Translations via UI

1. Go to **Settings** → **Translations** → **Import Terms**
2. Select or create language
3. Upload PO file
4. Choose overwrite option

### Import Translations via Code

```python
from odoo.tools.translate import TranslationImporter

translation_importer = TranslationImporter(self.env.cr)

# Load from file
translation_importer.load_file(
    filepath='/path/to/i18n/fr.po',
    lang='fr_FR'
)

# Or load from file object
with open('/path/to/i18n/fr.po', 'rb') as f:
    translation_importer.load(f, fileformat='po', lang='fr_FR')

# Save to database
translation_importer.save(overwrite=True)
```

### Updating Translations

After adding new translatable strings:

```bash
# Update POT file with new strings
./odoo-bin -c odoo.conf -d my_db --i18n-export=my_module/i18n/my_module.pot --addons-path=addons,custom_addons --modules=my_module
```

---

## Language Management

### Language Model

**File:** `odoo/addons/base/models/res_lang.py`

```python
class Lang(models.Model):
    _name = 'res.lang'
    _description = 'Languages'

    name = fields.Char(required=True)           # Display name
    code = fields.Char(string='Locale Code', required=True)  # en_US, fr_FR
    iso_code = fields.Char(string='ISO code')   # en, fr
    url_code = fields.Char(required=True)       # en-us, fr-fr
    active = fields.Boolean()
    direction = fields.Selection([
        ('ltr', 'Left-to-Right'),
        ('rtl', 'Right-to-Left')
    ])
    date_format = fields.Char(required=True)
    time_format = fields.Char(required=True)
    week_start = fields.Selection([
        ('1', 'Monday'),
        ('7', 'Sunday')
    ])
    grouping = fields.Char(string='Separator Format')
    decimal_point = fields.Char(required=True)
    thousands_sep = fields.Char()
```

### Loading a Language

```python
from odoo.addons.base.models.res_lang import Lang

# Activate a language
Lang._activate_lang('vi_VN')

# Or create if not exists
if not Lang.search_count([('code', '=', 'vi_VN')]):
    Lang._create_lang('vi_VN')

# Load translation terms for a language
self.env['ir.module.module']._load_module_terms(
    modules=['my_module'],
    langs=['vi_VN'],
    overwrite=False
)
```

### Get Installed Languages

```python
# Get all active languages
languages = self.env['res.lang'].get_installed()
# Returns: [{'code': 'en_US', 'name': 'English'}, ...]

# Get current user language
current_lang = self.env.lang or 'en_US'
```

### Language Context

```python
# Override language for specific operations
records.with_context(lang='fr_FR').name  # Returns French value

# In methods
def print_name(self):
    lang = self.env.context.get('lang', 'en_US')
    print(f"Language: {lang}")
```

---

## Translation Types

### Type: "code"

**Used for:** Python code strings (`_()`, `_lt()`) and JavaScript strings (`_t()`)

**Storage:** Loaded from PO files into memory at runtime

**Location in PO file:**
```po
#. odoo-python
#: code:addons/my_module/models.py:42
msgid "Translate me"
msgstr ""
```

### Type: "model"

**Used for:** Simple field translations (`translate=True`)

**Storage:** JSONB in database column

**Example:**
```python
name = fields.Char(translate=True)
# Stored as: {"en_US": "Name", "fr_FR": "Nom"}
```

### Type: "model_terms"

**Used for:** Term-based field translations (callable translate)

**Storage:** JSONB with individual term translations

**Example:**
```python
description = fields.Html(translate=html_translate)
# Stored as: {"en_US": "<p>Hello</p>", "fr_FR": "<p>Bonjour</p>"}
```

---

## Best Practices

### DO: Use Formatting for Dynamic Content

```python
# GOOD
message = _("Hello %(name)s, welcome to %(app)s", name=user.name, app="Odoo")
```

### DON'T: Concatenate Translated Strings

```python
# BAD - Grammar differs between languages
message = _("Hello") + " " + user.name + ", " + _("welcome")
```

### DO: Translate Complete Phrases

```python
# GOOD - Context preserved
msg = _("Delete selected records?")
```

### DON'T: Split Translatable Phrases

```python
# BAD - Loses context
msg = _("Delete") + " " + _("selected") + " " + _("records")
```

### DO: Provide Context for Ambiguous Terms

```python
# Use comments for translators
# Button label - verb
_(_t("Export"))

# Noun - file format
_("CSV")
```

### DO: Use Lazy Translation for Constants

```python
# GOOD
_lt = LazyTranslate(__name__)
STATUS_DRAFT = _lt("Draft")
STATUS_CONFIRMED = _lt("Confirmed")
```

### DON'T: Use Regular Translation for Constants

```python
# BAD - Translated at definition time (wrong language)
STATUS_DRAFT = _("Draft")
```

---

## Anti-Patterns

### ❌ Dynamic Source Strings

```python
# BAD - Cannot be extracted or translated
message = _(f"User {user.name} created")

# GOOD
message = _("User %(name)s created", name=user.name)
```

### ❌ Translated Technical Terms

```python
# BAD - Technical IDs should not be translated
xml_id = _("my_module.my_record")

# GOOD
xml_id = 'my_module.my_record'
```

### ❌ Conditional Inside Translation

```python
# BAD
if condition:
    msg = _("Success")
else:
    msg = _("Failure")

# GOOD - Different messages for different cases
msg = _("Operation %(status)s", status='success' if condition else 'failed')
```

### ❌ Translation in Loops

```python
# BAD - Performance issue
for record in records:
    name = _(record.name)  # Lookup each time

# GOOD - Translate once
label = _("Name")
for record in records:
    print(f"{label}: {record.name}")
```

### ❌ HTML in Python Translations

```python
# BAD - HTML should be in QWeb templates
message = _("<strong>Error:</strong> Invalid input")

# GOOD
message = _("Error: Invalid input")  # Format in QWeb
```

---

## Translation Testing

### Test Translations in Different Languages

```python
# Switch language context
def test_translations(self):
    # Test in French
    records_fr = self.records.with_context(lang='fr_FR')
    self.assertEqual(records_fr.name, "Nom Français")

    # Test in Vietnamese
    records_vi = self.records.with_context(lang='vi_VN')
    self.assertEqual(records_vi.name, "Tên Tiếng Việt")
```

### Test Translation Loading

```python
def test_translation_loaded(self):
    # Ensure translations are loaded
    self.env['ir.module.module']._load_module_terms(
        modules=['my_module'],
        langs=['fr_FR']
    )

    # Check translation exists
    translations = self.env['ir.translation'].search([
        ('module', '=', 'my_module'),
        ('lang', '=', 'fr_FR'),
        ('src', '=', 'Source String')
    ])
    self.assertTrue(translations)
    self.assertEqual(translations.value, 'Chaîne traduite')
```

---

## Key Files Reference

| Purpose | File |
|---------|------|
| Core translation system | `odoo/tools/translate.py` |
| Field definitions | `odoo/fields.py` |
| Model translation methods | `odoo/models.py` |
| Language model | `odoo/addons/base/models/res_lang.py` |
| JS translation utilities | `addons/web/static/src/core/l10n/translation.js` |
| Translation web controller | `addons/web/controllers/webclient.py` |
| Export wizard | `odoo/addons/base/wizard/base_export_language.py` |
| Import wizard | `odoo/addons/base/wizard/base_import_language.py` |
| Translation tests | `odoo/addons/base/tests/test_translate.py` |
| Base translation template | `odoo/addons/base/i18n/base.pot` |

---

## Quick Checklist

When adding translatable content:

- [ ] Python strings: Use `_()` for runtime, `_lt()` for constants
- [ ] JavaScript strings: Use `_t()`
- [ ] Field values: Add `translate=True` parameter
- [ ] QWeb templates: Text content is auto-translatable
- [ ] Provide context for ambiguous terms
- [ ] Use formatting for dynamic content
- [ ] Don't concatenate translated strings
- [ ] Update POT file after adding new strings
- [ ] Test in multiple languages
- [ ] Check RTL language support if needed


---

---
name: odoo-18-view
description: Complete reference for Odoo 18 XML views, actions, menus, and QWeb templates. Covers list, form, search, kanban, graph, pivot, calendar views and Odoo 18 changes.
globs: "**/views/**/*.xml"
topics:
  - View types (list, form, search, kanban, graph, pivot, calendar, activity)
  - List view features (editable, decoration, optional fields, widgets)
  - Form view structure (sheet, button box, notebook, chatter)
  - Search view features (fields, filters, group by)
  - Kanban view (color, progress, templates)
  - Actions (window, server, client, report)
  - Menus (structure, attributes)
  - View inheritance (xpath, position, shorthand)
  - QWeb templates
when_to_use:
  - Writing XML views
  - Creating actions and menus
  - Implementing view inheritance
  - Building QWeb templates
  - Migrating from Odoo 17 to 18
---

# Odoo 18 View Guide

Complete reference for Odoo 18 XML views, actions, menus, and QWeb templates.

## Table of Contents

1. [View Types](#view-types)
2. [List View (Tree)](#list-view-tree)
3. [Form View](#form-view)
4. [Search View](#search-view)
5. [Kanban View](#kanban-view)
6. [Graph & Pivot Views](#graph--pivot-views)
7. [Calendar View](#calendar-view)
8. [Actions](#actions)
9. [Menus](#menus)
10. [View Inheritance](#view-inheritance)

---

## View Types

| Type | XML Tag | Use For |
|------|---------|---------|
| `list` | `<list>` | Table/List view (formerly `<tree>`) |
| `form` | `<form>` | Single record edit/view |
| `search` | `<search>` | Search panel and filters |
| `kanban` | `<kanban>` | Card-based view |
| `graph` | `<graph>` | Bar/line/pie charts |
| `pivot` | `<pivot>` | Pivot table |
| `calendar` | `<calendar>` | Calendar view |
| `activity` | `<activity>` | Activity/messaging view |
| `cohort` | `<cohort>` | Cohort analysis |
| `qweb` | `<template>` | QWeb template |

---

## List View (Tree)

### Basic List View

```xml
<record id="view_my_model_list" model="ir.ui.view">
    <field name="name">my.model.list</field>
    <field name="model">my.model</field>
    <field name="arch" type="xml">
        <list string="My Records">
            <field name="name"/>
            <field name="date"/>
            <field name="state"/>
        </list>
    </field>
</record>
```

### List View Features (Odoo 18)

```xml
<list string="My Records"
      sample="1"              # Show sample data when empty
      multi_edit="1"          # Enable inline edit
      editable="bottom"       # Edit mode (top/bottom)
      default_order="date desc"
      limit="80">

    <!-- Decoration (row styling) -->
    <field name="state"
           decoration-success="state == 'done'"
           decoration-danger="state == 'cancel'"
           decoration-muted="not active"/>

    <!-- Optional fields -->
    <field name="phone" optional="show"/>    <!-- shown by default -->
    <field name="mobile" optional="hide"/>    <!-- hidden by default -->
    <field name="note" optional="hide"/>      <!-- can toggle in UI -->

    <!-- Special widgets -->
    <field name="image" widget="image"/>
    <field name="user_id" widget="many2one_avatar_user"/>
    <field name="category_id" widget="many2many_tags" options="{'color_field': 'color'}"/>
    <field name="sequence" widget="handle"/>   <!-- drag to reorder -->

    <!-- Groups restriction -->
    <field name="company_id" groups="base.group_multi_company"/>
</list>
```

### Decoration Types

| Type | Color | Use For |
|------|-------|---------|
| `decoration-danger` | Red | Error, cancelled |
| `decoration-warning` | Orange | Warning |
| `decoration-success` | Green | Success, done |
| `decoration-info` | Blue | Info |
| `decoration-muted` | Gray | Inactive, archived |
| `decoration-bf` | Bold font | Highlight |
| `decoration-it` | Italic | Emphasis |

---

## Form View

### Basic Form View

```xml
<record id="view_my_model_form" model="ir.ui.view">
    <field name="name">my.model.form</field>
    <field name="model">my.model</field>
    <field name="arch" type="xml">
        <form string="My Record">
            <sheet>
                <group>
                    <group>
                        <field name="name"/>
                        <field name="date"/>
                    </group>
                    <group>
                        <field name="user_id"/>
                        <field name="company_id"/>
                    </group>
                </group>
            </sheet>
        </form>
    </field>
</record>
```

### Form View Structure (Odoo 18)

```xml
<form string="My Record" create="true" edit="true" delete="true">

    <!-- Edit-only alerts -->
    <div class="alert alert-warning oe_edit_only" role="alert"
         invisible="not warning_message">
        <field name="warning_message"/>
    </div>

    <!-- Ribbon (archived badge) -->
    <widget name="web_ribbon" title="Archived"
            bg_color="text-bg-danger" invisible="active"/>

    <sheet>
        <!-- Button box (stat buttons) -->
        <div class="oe_button_box" name="button_box">
            <button name="action_confirm" type="object" class="oe_stat_button" icon="fa-check">
                <div class="o_field_widget o_stat_info">
                    <span class="o_stat_text">Confirm</span>
                </div>
            </button>
        </div>

        <!-- Chatter -->
        <div class="oe_chatter">
            <field name="message_ids"/>
            <field name="activity_ids"/>
        </div>

        <!-- Main content -->
        <group>
            <group>
                <field name="name" default_focus="1" placeholder="Record Name"/>
                <field name="code" required="1"/>
            </group>
            <group>
                <field name="user_id"/>
                <field name="company_id"/>
            </group>
        </group>

        <!-- Notebook (tabs) -->
        <notebook>
            <page string="Information" name="info">
                <group>
                    <field name="description"/>
                </group>
            </page>
            <page string="Lines" name="lines">
                <field name="line_ids" nolabel="1">
                    <tree editable="bottom">
                        <field name="product_id"/>
                        <field name="quantity"/>
                    </tree>
                </field>
            </page>
        </notebook>
    </sheet>

    <!-- Chatter (alternative position) -->
    <div class="oe_chatter">
        <field name="message_ids"/>
        <field name="activity_ids"/>
    </div>
</form>
```

### Field Widgets (Form)

```xml
<!-- Basic fields -->
<field name="name"/>
<field name="description" widget="text"/>  <!-- Long text -->
<field name="notes" widget="text" placeholder="Notes..."/>

<!-- Date/Datetime -->
<field name="date" widget="date"/>
<field name="datetime" widget="datetime"/>

<!-- Specialized widgets -->
<field name="email" widget="email"/>
<field name="phone" widget="phone" options="{'enable_sms': false}"/>
<field name="website" widget="url"/>
<field name="image" widget="image" class="oe_avatar"/>

<!-- Many2one with options -->
<field name="partner_id" options="{'no_open': True, 'no_create': True}"/>
<field name="user_id" widget="many2one_avatar_user"/>

<!-- Many2many -->
<field name="tag_ids" widget="many2many_tags" options="{'color_field': 'color'}"/>
<field name="category_ids" widget="many2many_checkboxes"/>

<!-- Radio, Boolean -->
<field name="type" widget="radio"/>
<field name="active" widget="boolean_toggle"/>

<!-- Selection -->
<field name="state" widget="statusbar"/>
<field name="priority" widget="priority"/>

<!-- Monetary -->
<field name="amount" widget="monetary" options="{'currency_field': 'currency_id'"/>

<!-- Read-only indicators -->
<field name="country_id" readonly="1"/>
<field name="create_date" readonly="1" widget="relative"/>

<!-- Domain widget (visual domain builder) -->
<field name="domain" widget="domain"/>

<!-- Code editor -->
<field name="arch" widget="code" options="{'mode': 'xml'}"/>
```

### Field Options

```xml
<!-- Common options -->
<field name="name" options="{'horizontal': true}"/>  <!-- radio horizontal -->
<field name="name" options="{'line_breaks': false}"/>  <!-- text widget -->
<field name="partner_id" options="{'no_open': True, 'no_create': True}"/>
<field name="date" options="{'no_create': True}"/>

<!-- Placeholder -->
<field name="email" placeholder="email@example.com"/>

<!-- Required / Readonly -->
<field name="name" required="1"/>
<field name="code" readonly="1"/>

### Dynamic Attributes (Odoo 18 - Direct Attributes)

**IMPORTANT**: In Odoo 18, the `attrs` attribute is **DEPRECATED**. Use direct attributes instead.

#### ❌ BAD: Using `attrs` (Old Odoo 13-17 syntax)

```xml
<!-- Old syntax - DEPRECATED in Odoo 18 -->
<field name="is_company" attrs="{'invisible': [('type', '=', 'contact')]"/>
<field name="email" attrs="{'required': [('is_company', '=', True)]}"/>
<field name="code" attrs="{'readonly': [('state', '!=', 'draft')]}"/>
<button name="action" attrs="{'invisible': [('state', '=', 'done')]}"/>
```

#### ✅ GOOD: Using Direct Attributes (Odoo 18 syntax)

```xml
<!-- New syntax - Odoo 18+ -->
<field name="is_company" invisible="type == 'contact'"/>
<field name="email" required="is_company"/>
<field name="code" readonly="state != 'draft'"/>
<button name="action" invisible="state == 'done'"/>

<!-- Complex domain expressions -->
<field name="company_name" invisible="not company_name or company_name == '' or is_company"/>
<div invisible="not parent_id" groups="base.group_no_one">
    <field name="type" class="oe_inline"/>
</div>
```

#### Available Dynamic Attributes

| Attribute | Use For | Example |
|-----------|---------|---------|
| `invisible` | Hide field/element conditionally | `invisible="state == 'done'"` |
| `readonly` | Make field read-only conditionally | `readonly="state != 'draft'"` |
| `required` | Make field required conditionally | `required="is_company"` |
| `column_invisible` | Hide list column | `column_invisible="True"` |

### Context / Domain

```xml
<!-- Context / Domain -->
<field name="product_id" context="{'default_type': 'service'}"/>
<field name="partner_id" domain="[('supplier_rank', '>', 0)]"/>

<!-- Class -->
<field name="phone" class="o_force_ltr"/>
```

---

## Search View

### Basic Search View

```xml
<record id="view_my_model_search" model="ir.ui.view">
    <field name="name">my.model.search</field>
    <field name="model">my.model</field>
    <field name="arch" type="xml">
        <search string="Search My Model">
            <field name="name"/>
            <field name="code"/>
            <filter string="Active" name="active" domain="[('active', '=', True)]"/>
            <filter string="Draft" name="draft" domain="[('state', '=', 'draft')]"/>
        </search>
    </field>
</record>
```

### Search View Features (Odoo 18)

```xml
<search string="Search My Model">

    <!-- Searchable fields -->
    <field name="name"
           filter_domain="['|', ('name', 'ilike', self), ('code', 'ilike', self)]"
           string="Name"/>
    <field name="partner_id"/>
    <field name="date"/>

    <!-- Filters (saved searches) -->
    <filter string="My Records" name="my_records"
            domain="[('user_id', '=', uid)]"/>
    <filter string="This Month" name="this_month"
            domain="[('date', '>=', (context_today() + relativedelta(day=1)).strftime('%Y-%m-%d'))]"/>

    <!-- Separator -->
    <separator/>

    <!-- Group By -->
    <group expand="0" string="Group By">
        <filter string="State" name="state" context="{'group_by': 'state'}"/>
        <filter string="Partner" name="partner" context="{'group_by': 'partner_id'}"/>
        <filter string="Date" name="date" context="{'group_by': 'date:month'}"/>
    </group>
</search>
```

---

## Kanban View

### Basic Kanban View

```xml
<record id="view_my_model_kanban" model="ir.ui.view">
    <field name="name">my.model.kanban</field>
    <field name="model">my.model</field>
    <field name="arch" type="xml">
        <kanban default_group_by="state" quick_create="false">
            <field name="name"/>
            <field name="state"/>
            <templates>
                <t t-name="kanban-box">
                    <div class="oe_kanban_card">
                        <field name="name"/>
                        <field name="state"/>
                    </div>
                </t>
            </templates>
        </kanban>
    </field>
</record>
```

### Kanban with Color and Progress

```xml
<kanban default_group_by="state"
       class="o_kanban_small_column"
       quick_create="true"
       drag_drop="true"
       group_drag_drop="true">

    <field name="name"/>
    <field name="priority"/>
    <field name="color"/>

    <templates>
        <t t-name="kanban-box">
            <div t-attf-class="oe_kanban_card oe_kanban_global_click">
                <div class="oe_kanban_content">
                    <!-- Color bar -->
                    <div class="oe_kanban_card_header"
                         t-attf-style="background-color: #{record.color.raw_value or '#EEE'}">
                        <field name="name"/>
                    </div>

                    <!-- Priority -->
                    <field name="priority" widget="priority"/>

                    <!-- Footer -->
                    <div class="oe_kanban_footer">
                        <field name="date"/>
                    </div>
                </div>
            </div>
        </t>
    </templates>
</kanban>
```

---

## Graph & Pivot Views

### Graph View (Charts)

```xml
<record id="view_my_model_graph" model="ir.ui.view">
    <field name="name">my.model.graph</field>
    <field name="model">my.model</field>
    <field name="arch" type="xml">
        <graph string="Sales Analysis" type="bar">
            <field name="date" interval="month" type="row"/>
            <field name="partner_id" type="col"/>
            <field name="amount" type="measure"/>
        </graph>
    </field>
</record>
```

**Graph attributes**:
- `type`: `bar`, `line`, `pie`
- `stacked`: `true` for stacked charts
- `interval`: `day`, `week`, `month`, `quarter`, `year`

### Pivot View

```xml
<record id="view_my_model_pivot" model="ir.ui.view">
    <field name="name">my.model.pivot</field>
    <field name="model">my.model</field>
    <field name="arch" type="xml">
        <pivot string="Sales Analysis">
            <field name="date" interval="month" type="row"/>
            <field name="partner_id" type="col"/>
            <field name="amount" type="measure"/>
        </pivot>
    </field>
</record>
```

---

## Calendar View

```xml
<record id="view_my_model_calendar" model="ir.ui.view">
    <field name="name">my.model.calendar</field>
    <field name="model">my.model</field>
    <field name="arch" type="xml">
        <calendar string="My Meetings"
                  date_start="start"
                  date_stop="stop"
                  color="partner_id"
                  mode="month">
            <field name="name"/>
            <field name="partner_id"/>
        </calendar>
    </field>
</record>
```

**Calendar attributes**:
- `date_start`: Start date field (required)
- `date_stop`: End date field
- `date_delay`: Duration alternative to date_stop
- `color`: Field for color coding
- `mode`: `day`, `week`, `month`, `year`

---

## Actions

### Window Action (ir.actions.act_window)

```xml
<record id="action_my_model" model="ir.actions.act_window">
    <field name="name">My Model</field>
    <field name="res_model">my.model</field>
    <field name="view_mode">tree,form</field>
    <field name="domain">[]</field>
    <field name="context">{'search_default_active': 1}</field>
    <field name="view_id" ref="view_my_model_tree"/>
    <field name="limit">80</field>
    <field name="target">current</field>  <!-- or "new" for popup -->
    <field name="help" type="html">
        <p class="o_view_nocontent_smiling_face">
            Create your first record!
        </p>
    </field>
</record>
```

### Server Action (ir.actions.server)

```xml
<record id="action_my_server" model="ir.actions.server">
    <field name="name">My Server Action</field>
    <field name="model_id" ref="model_my_model"/>
    <field name="state">code</field>
    <field name="code">
        records.action_done()
    </field>
</record>
```

**Server action states**:
- `code`: Execute Python code
- `object_create`: Create new record
- `object_write`: Update records
- `object_delete`: Delete records
- `multi`: Execute multiple actions

### Client Action (ir.actions.client)

```xml
<record id="action_my_client" model="ir.actions.client">
    <field name="name">My Client Action</field>
    <field name="tag">reload</field>  <!-- reload, opening, etc. -->
    <field name="params">{'param': 'value'}</field>
</record>
```

### Report Action (ir.actions.report)

```xml
<record id="report_my_model" model="ir.actions.report">
    <field name="name">My Report</field>
    <field name="model">my.model</field>
    <field name="report_type">qweb-pdf</field>
    <field name="report_name">my_module.report_template</field>
    <field name="report_file">my_report</field>
    <field name="binding_model_id" ref="model_my_model"/>
    <field name="binding_type">report</field>
</record>
```

---

## Menus

### Menu Structure

```xml
<!-- Top-level menu -->
<menuitem id="menu_my_root"
          name="My Module"
          sequence="10"/>

<!-- Sub-menu -->
<menuitem id="menu_my_model"
          name="My Models"
          parent="menu_my_root"
          action="action_my_model"
          sequence="1"/>

<!-- Without action (folder) -->
<menuitem id="menu_my_folder"
          name="Folder"
          parent="menu_my_root"
          sequence="2"/>
```

### Menu Attributes

| Attribute | Description |
|-----------|-------------|
| `id` | Unique XML ID |
| `name` | Display name |
| `parent` | Parent menu XML ID |
| `action` | Action to execute |
| `sequence` | Sort order (lower = first) |
| `groups` | Comma-separated group IDs |
| `web_icon` | Icon for web client |
| `active` | True/False |

---

## View Inheritance

### Extend View with XPath

```xml
<record id="view_res_partner_form_inherit" model="ir.ui.view">
    <field name="name">res.partner.form.inherit</field>
    <field name="model">res.partner</field>
    <field name="inherit_id" ref="base.view_partner_form"/>
    <field name="arch" type="xml">

        <!-- Insert after existing field -->
        <xpath expr="//field[@name='email']" position="after">
            <field name="my_field"/>
        </xpath>

        <!-- Replace entire element -->
        <xpath expr="//field[@name='name']" position="replace">
            <field name="name" required="1" placeholder="Name..."/>
        </xpath>

        <!-- Add inside element (before content) -->
        <xpath expr="//sheet/group" position="inside">
            <field name="extra_field"/>
        </xpath>

        <!-- Add before element -->
        <xpath expr="//field[@name='email']" position="before">
            <field name="prefix_field"/>
        </xpath>

        <!-- Remove element -->
        <xpath expr="//field[@name='old_field']" position="replace"/>

        <!-- Modify attributes -->
        <xpath expr="//field[@name='name']" position="attributes">
            <attribute name="required">True</attribute>
            <attribute name="readonly">True</attribute>
        </xpath>

        <!-- Add attribute -->
        <xpath expr="//field[@name='name']" position="attributes">
            <attribute name="placeholder" add="true">Enter name</attribute>
        </xpath>

    </field>
</record>
```

### Shorthand Position (Odoo 18)

```xml
<!-- Instead of xpath, use direct field name with position -->
<field name="email" position="after">
    <field name="my_field"/>
</field>

<field name="name" position="replace">
    <field name="name" required="1"/>
</field>

<sheet position="inside">
    <div class="my_class">Content</div>
</sheet>
```

---

## Complete Module Example

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <data>

        <!-- LIST VIEW -->
        <record id="view_my_module_list" model="ir.ui.view">
            <field name="name">my.module.list</field>
            <field name="model">my.module</field>
            <field name="arch" type="xml">
                <list string="My Modules">
                    <field name="name" decoration-success="state == 'done'"/>
                    <field name="date"/>
                    <field name="state"/>
                    <field name="user_id" optional="show"/>
                </list>
            </field>
        </record>

        <!-- FORM VIEW -->
        <record id="view_my_module_form" model="ir.ui.view">
            <field name="name">my.module.form</field>
            <field name="model">my.module</field>
            <field name="arch" type="xml">
                <form string="My Module" create="true">
                    <sheet>
                        <div class="oe_button_box" name="button_box">
                            <button name="action_confirm" type="object"
                                    string="Confirm" class="oe_stat_button" icon="fa-check"/>
                        </div>
                        <widget name="web_ribbon" title="Archived"
                                bg_color="text-bg-danger" invisible="active"/>
                        <div class="oe_title">
                            <h1>
                                <field name="name" placeholder="Module Name"/>
                            </h1>
                        </div>
                        <group>
                            <group>
                                <field name="date"/>
                                <field name="user_id"/>
                            </group>
                            <group>
                                <field name="state" widget="statusbar"/>
                                <field name="priority" widget="priority"/>
                            </group>
                        </group>
                        <notebook>
                            <page string="Description">
                                <field name="description" nolabel="1"/>
                            </page>
                            <page string="Lines">
                                <field name="line_ids" nolabel="1">
                                    <tree editable="bottom">
                                        <field name="product_id"/>
                                        <field name="quantity"/>
                                        <field name="price"/>
                                    </tree>
                                </field>
                            </page>
                        </notebook>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                        <field name="activity_ids"/>
                    </div>
                </form>
            </field>
        </record>

        <!-- SEARCH VIEW -->
        <record id="view_my_module_search" model="ir.ui.view">
            <field name="name">my.module.search</field>
            <field name="model">my.module</field>
            <field name="arch" type="xml">
                <search string="Search My Module">
                    <field name="name" filter_domain="['|', ('name', 'ilike', self), ('code', 'ilike', self)]"/>
                    <filter string="My Items" name="my_items" domain="[('user_id', '=', uid)]"/>
                    <separator/>
                    <filter string="Draft" name="draft" domain="[('state', '=', 'draft')]"/>
                    <filter string="Done" name="done" domain="[('state', '=', 'done')]"/>
                    <group expand="0" string="Group By">
                        <filter string="State" name="state" context="{'group_by': 'state'}"/>
                        <filter string="User" name="user" context="{'group_by': 'user_id'}"/>
                    </group>
                </search>
            </field>
        </record>

        <!-- KANBAN VIEW -->
        <record id="view_my_module_kanban" model="ir.ui.view">
            <field name="name">my.module.kanban</field>
            <field name="model">my.module</field>
            <field name="arch" type="xml">
                <kanban default_group_by="state">
                    <field name="name"/>
                    <field name="state"/>
                    <templates>
                        <t t-name="kanban-box">
                            <div class="oe_kanban_card">
                                <div class="oe_kanban_content">
                                    <strong><field name="name"/></strong>
                                    <field name="state"/>
                                </div>
                            </div>
                        </t>
                    </templates>
                </kanban>
            </field>
        </record>

        <!-- ACTION -->
        <record id="action_my_module" model="ir.actions.act_window">
            <field name="name">My Module</field>
            <field name="res_model">my.module</field>
            <field name="view_mode">tree,form,kanban</field>
            <field name="context">{'search_default_my_items': 1}</field>
            <field name="help" type="html">
                <p class="o_view_nocontent_smiling_face">
                    Create your first record!
                </p>
            </field>
        </record>

        <!-- MENU -->
        <menuitem id="menu_my_root" name="My Module" sequence="50"/>
        <menuitem id="menu_my_module" name="Records"
                  parent="menu_my_root"
                  action="action_my_module"
                  sequence="1"/>

    </data>
</odoo>
```

---

## QWeb Templates

### Basic Template

```xml
<template id="my_module_template">
    <div class="my_class">
        <h1>My Template</h1>
        <t t-if="records">
            <t t-foreach="records" t-as="record">
                <span t-esc="record.name"/>
            </t>
        </t>
        <t t-else="">
            <p>No records found</p>
        </t>
    </div>
</template>
```

### Inherit Template

```xml
<template id="website_sale_products_inherit" inherit_id="website_sale.products">
    <xpath expr="//div[@id='products_wrap']" position="inside">
        <div class="my_extra_content">Extra content</div>
    </xpath>
</template>
```

---

## Common Anti-Patterns

### ❌ BAD: Using deprecated `attrs` attribute (Odoo 17-)

```xml
<!-- Odoo 17 and earlier -->
<field name="is_company" attrs="{'invisible': [('type', '=', 'contact')]}"/>
<field name="email" attrs="{'required': [('is_company', '=', True)]}"/>
<field name="code" attrs="{'readonly': [('state', '!=', 'draft')]}"/>
<button name="action" attrs="{'invisible': [('state', '=', 'done')]}"/>
```

### ✅ GOOD: Use direct attributes (Odoo 18+)

```xml
<!-- Odoo 18+ - attrs is REMOVED -->
<field name="is_company" invisible="type == 'contact'"/>
<field name="email" required="is_company"/>
<field name="code" readonly="state != 'draft'"/>
<button name="action" invisible="state == 'done'"/>
```

**Migration Note**: Replace all `attrs="{'invisible': [...]}"` with `invisible="..."`, `attrs="{'readonly': [...]}"` with `readonly="..."`, and `attrs="{'required': [...]}"` with `required="..."`. The domain syntax inside these attributes is now a Python expression, not a domain tuple list.

### ❌ BAD: Using old `<tree>` tag

```xml
<!-- Odoo 17- -->
<tree string="Records">
    <field name="name"/>
</tree>
```

### ✅ GOOD: Use `<list>` tag

```xml
<!-- Odoo 18+ -->
<list string="Records">
    <field name="name"/>
</list>
```

### ❌ BAD: Missing `inverse_name` for One2many

```xml
<field name="line_ids" comodel_name="sale.order.line"/>
```

### ✅ GOOD: Always specify `inverse_name`

```xml
<field name="line_ids" comodel_name="sale.order.line" inverse_name="order_id"/>
```

### ❌ BAD: Hardcoded domain in view

```xml
<field name="partner_id" domain="[('id', '=', 1)]"/>
```

### ✅ GOOD: Use dynamic domain or none

```xml
<field name="partner_id" domain="[('supplier_rank', '>', 0)]"/>
```

