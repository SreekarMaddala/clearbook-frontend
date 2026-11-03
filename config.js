// Frontend stays local for now. Backend deployments target Hyderabad.
window.CLEARBOOK_CONFIG = {
  apiBase: '/api',
  region: 'ap-south-2', // Asia Pacific (Hyderabad)
  getAccessToken: () => sessionStorage.getItem('clearbook-access-token'),
};
