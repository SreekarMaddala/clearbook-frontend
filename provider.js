'use strict';

window.ClearbookProvider = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => (
    {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]
  ));
  const usersIn = (users, organizationId) => users.filter(user => user.customer_id === organizationId);

  function statusButton(kind, record) {
    return `<button class="button" data-provider-kind="${kind}" data-provider-id="${escape(record.id)}" data-provider-enabled="${!record.enabled}">${record.enabled ? 'Disable' : 'Enable'}</button>`;
  }

  function render({customers, users, page, loading, error}) {
    const userView = page === 'users';
    const available = customers.filter(org => org.enabled && usersIn(users, org.id).length < 2);
    const content = userView
      ? `<thead><tr><th>EMAIL</th><th>ORGANIZATION</th><th>ACCESS</th><th></th></tr></thead><tbody>${users.map(user => {
          const org = customers.find(item => item.id === user.customer_id);
          return `<tr><td>${escape(user.email)}</td><td>${escape(org?.name || 'Unknown organization')}</td><td>${user.enabled ? 'Enabled' : 'Disabled'}</td><td>${statusButton('users', user)}</td></tr>`;
        }).join('')}</tbody>`
      : `<thead><tr><th>ORGANIZATION</th><th>USERS</th><th>ACCESS</th><th></th></tr></thead><tbody>${customers.map(org => {
          const count = usersIn(users, org.id).length;
          return `<tr><td><strong>${escape(org.name)}</strong></td><td>${count} / 2</td><td>${org.enabled ? 'Enabled' : 'Disabled'}</td><td>${statusButton('customers', org)}</td></tr>`;
        }).join('')}</tbody>`;
    const count = userView ? users.length : customers.length;
    const addAction = userView ? 'new-customer-user' : 'new-customer';
    const addLabel = userView ? 'Add user' : 'Onboard organization';
    const addDisabled = userView && available.length === 0;
    return `<div class="page-heading"><div><div class="eyebrow">SOFTWARE PROVIDER</div><h1>${userView ? 'Organization users' : 'Organizations'}</h1><p class="page-description">Onboard organizations and manage their workspace access.</p></div><div class="heading-actions"><button class="button" data-action="refresh" ${loading ? 'disabled' : ''}>${loading ? 'Refreshing...' : 'Refresh'}</button><button class="button primary" data-action="${addAction}" ${addDisabled ? 'disabled title="Every enabled organization already has two users"' : ''}>${addLabel}</button></div></div>
      ${error ? `<div class="connection-banner error" role="alert">${escape(error)}</div>` : ''}
      <div class="provider-metrics"><section class="panel"><small>Organizations</small><strong>${customers.length}</strong></section><section class="panel"><small>Enabled organizations</small><strong>${customers.filter(org => org.enabled).length}</strong></section><section class="panel"><small>Organization users</small><strong>${users.length}</strong></section></div>
      <section class="panel"><div class="panel-heading"><h2>${userView ? 'User access (maximum two per organization)' : 'Organization workspaces'}</h2></div><div class="table-scroll"><table>${content}</table></div>${count ? '' : `<div class="empty">${loading ? 'Loading...' : userView ? 'Onboard an organization before adding its users.' : 'Onboard your first organization.'}</div>`}</section>`;
  }

  function form(kind, customers, users = []) {
    const isUser = kind === 'user';
    const available = customers.filter(org => org.enabled && usersIn(users, org.id).length < 2);
    return `<div class="modal-head"><h2 id="detail-title">${isUser ? 'Add organization user' : 'Onboard organization'}</h2><button class="close-button" data-action="close-detail" aria-label="Close form">×</button></div><form id="${isUser ? 'customer-user-form' : 'customer-form'}" class="form-body">
      ${isUser ? `<div class="form-grid"><label class="form-field full">Organization<select name="customer_id" required><option value="">Choose an organization</option>${available.map(org => `<option value="${escape(org.id)}">${escape(org.name)} (${2 - usersIn(users, org.id).length} seat${usersIn(users, org.id).length === 1 ? '' : 's'} left)</option>`).join('')}</select></label><label class="form-field full">Email<input name="email" type="email" maxlength="254" autocomplete="off" required></label><label class="form-field full">Temporary password<input name="temporary_password" type="password" minlength="12" maxlength="256" autocomplete="new-password" required></label></div><p class="provider-form-note">Each organization can have up to two users. Use a 12+ character password with uppercase, lowercase, a number and a symbol. Share it privately. New users choose a new password at first sign-in. Existing accounts keep their current password. No invitation email is sent.</p>` : '<label class="form-field">Organization name<input name="name" maxlength="120" required autocomplete="organization"></label>'}
      <div class="form-actions"><button type="button" class="button" data-action="close-detail">Cancel</button><button type="submit" class="button primary">${isUser ? 'Add user' : 'Create organization'}</button></div></form>`;
  }

  return {render, form};
})();
