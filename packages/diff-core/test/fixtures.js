export const baseSpec = () => ({
  openapi: '3.0.3',
  info: { title: 'Orders API', version: '2.3.1', description: 'Order management endpoints.' },
  servers: [{ url: 'https://api.example.com/v2' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
      apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    },
    schemas: {
      Order: {
        type: 'object',
        required: ['id', 'status'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['pending', 'paid', 'shipped'] },
          total: { type: 'number', minimum: 0 },
          note: { type: 'string', nullable: true },
        },
      },
      Address: {
        type: 'object',
        properties: { city: { type: 'string' }, zip: { type: 'string' } },
      },
    },
  },
  paths: {
    '/orders': {
      get: {
        summary: 'List orders',
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', maximum: 100 } },
          { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'A page of orders',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
              },
            },
          },
          400: { description: 'Bad request' },
        },
      },
      post: {
        summary: 'Create order',
        security: [{ bearerAuth: ['orders:write'] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  items: { type: 'array', items: { type: 'string' } },
                  shipping: { $ref: '#/components/schemas/Address' },
                  coupon: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Created' },
          422: { description: 'Validation failed' },
        },
      },
    },
    '/orders/{id}': {
      get: {
        summary: 'Get order',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'One order',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } },
          },
          404: { description: 'Not found' },
        },
      },
      delete: {
        summary: 'Delete order',
        security: [{ bearerAuth: ['orders:delete'] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'Deleted' } },
      },
    },
  },
});

/** Deep clone helper so tests never mutate shared fixtures. */
export const clone = (value) => JSON.parse(JSON.stringify(value));

export const stable = (a, b) => {
  const ste = (v) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(ste).join(',')}]`;
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${ste(v[k])}`).join(',')}}`;
  };
  return ste(a) === ste(b);
};
