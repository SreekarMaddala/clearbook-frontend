// These are public Cognito identifiers, not secrets.
window.CLEARBOOK_CONFIG = {
  apiBase: '/api',
  region: 'ap-south-2', // Asia Pacific (Hyderabad)
  auth: {
    enabled: !['localhost','127.0.0.1','[::1]'].includes(window.location.hostname),
    domain: 'https://clearbook-337023347522-ap-south-2.auth.ap-south-2.amazoncognito.com',
    clientId: 'qf45j6u4nn5keh80oo07kbr91',
    issuer: 'https://cognito-idp.ap-south-2.amazonaws.com/ap-south-2_vy4GCYTNM',
  },
  getAccessToken: () => window.ClearbookAuth?.getAccessToken(),
};
