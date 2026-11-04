'use strict';

window.ClearbookProvider = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => (
    {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]
  ));

  function statusButton(kind, record) {
    return `<button class="button" data-provider-kind="${kind}" data-provider-id="${escape(record.id)}" data-provider-enabled="${!record.enabled}">${record.enabled ? 'Disable' : 'Enable'}</button>`;
  }

  function render({customers, users, page, loading, error}) {
    const userView = page === 'users';
    const customerName = id => customers.find(customer => customer.id === id)?.name || 'Unknown customer';
    const content = userView
      ? `<thead><tr><th>EMAIL</th><th>CUSTOMER</th><th>ACCESS</th><th></th></tr></thead><tbody>${users.map(user => `<tr><td>${escape(user.email)}</td><td>${escape(customerName(user.customer_id))}</td><td>${user.enabled ? 'Enabled' : 'Disabled'}</td><td>${statusButton('users', user)}</td></tr>`).join('')}</tbody>`
      : `<thead><tr><th>CUSTOMER</th><th>USERS</th><th>ACCESS</th><th></th></tr></thead><tbody>${customers.map(customer => `<tr><td><strong>${escape(customer.name)}</strong></td><td>${users.filter(user => user.customer_id === customer.id).length}</td><td>${customer.enabled ? 'Enabled' : 'Disabled'}</td><td>${statusButton('customers', customer)}</td></tr>`).join('')}</tbody>`;
    const count = userView ? users.length : customers.length;
    return `<div class="page-heading"><div><div class="eyebrow">SOFTWARE PROVIDER</div><h1>${userView ? 'Customer users' : 'Your customers'}</h1><p class="page-description">Manage customer access and workspace membership.</p></div><div class="heading-actions"><button class="button" data-action="refresh" ${loading ? 'disabled' : ''}>${loading ? 'Refreshing...' : 'Refresh'}</button><button class="button primary" data-action="${userView ? 'new-customer-user' : 'new-customer'}">${userView ? 'Add user' : 'Add customer'}</button></div></div>
      ${error ? `<div class="connection-banner error" role="alert">${escape(error)}</div>` : ''}
      <div class="provider-metrics"><section class="panel"><small>Customers</small><strong>${customers.length}</strong></section><section class="panel"><small>Enabled customers</small><strong>${customers.filter(customer => customer.enabled).length}</strong></section><section class="panel"><small>Customer users</small><strong>${users.length}</strong></section></div>
      <section class="panel"><div class="panel-heading"><h2>${userView ? 'User access' : 'Customer workspaces'}</h2></div><div class="table-scroll"><table>${content}</table></div>${count ? '' : `<div class="empty">${loading ? 'Loading...' : userView ? 'Add a customer, then create their first user.' : 'Add your first customer to create a separate workspace.'}</div>`}</section>`;
  }

  function form(kind, customers) {
    const isUser = kind === 'user';
    return `<div class="modal-head"><h2 id="detail-title">${isUser ? 'Add customer user' : 'Add customer'}</h2><button class="close-button" data-action="close-detail" aria-label="Close form">×</button></div><form id="${isUser ? 'customer-user-form' : 'customer-form'}" class="form-body">
      ${isUser ? `<div class="form-grid"><label class="form-field full">Customer<select name="customer_id" required><option value="">Choose a customer</option>${customers.filter(customer => customer.enabled).map(customer => `<option value="${escape(customer.id)}">${escape(customer.name)}</option>`).join('')}</select></label><label class="form-field full">Email<input name="email" type="email" maxlength="254" autocomplete="off" required></label><label class="form-field full">Temporary password<input name="temporary_password" type="password" minlength="12" maxlength="256" autocomplete="new-password" required></label></div><p class="provider-form-note">Use 12+ characters with uppercase, lowercase, a number and a symbol. Share the email and temporary password privately with the customer. New users must choose a new password at first sign-in. Existing accounts keep their current password. No invitation email is sent.</p>` : '<label class="form-field">Customer name<input name="name" maxlength="120" required autocomplete="organization"></label>'}
      <div class="form-actions"><button type="button" class="button" data-action="close-detail">Cancel</button><button type="submit" class="button primary">${isUser ? 'Create user' : 'Create customer'}</button></div></form>`;
  }

  return {render, form};
})();
