export const before = {
  openapi: '3.0.3',
  info: { title: 'Payments API', version: '1.4.0' },
  paths: {
    '/charges': {
      get: {
        parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'integer', maximum: 100 } }],
        responses: {
          200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Charge' } } } },
          400: { description: 'bad request' },
        },
      },
      post: {
        security: [{ bearerAuth: ['charges:write'] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Charge' } } },
        },
        responses: { 201: { description: 'created' } },
      },
    },
    '/charges/{id}': {
      get: {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'ok' }, 404: { description: 'missing' } },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    schemas: {
      Charge: {
        type: 'object',
        required: ['id', 'amount'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          amount: { type: 'integer' },
          currency: { type: 'string', enum: ['usd', 'eur'] },
          receipt: { type: 'string', nullable: true },
        },
      },
    },
  },
};

export const after = (() => {
  const clone = JSON.parse(JSON.stringify(before));
  clone.info.version = '2.0.0';
  clone.components.schemas.Charge.properties.amount.type = 'string';
  delete clone.components.schemas.Charge.properties.receipt;
  clone.paths['/charges'].get.parameters.push({
    name: 'account',
    in: 'query',
    required: true,
    schema: { type: 'string' },
  });
  clone.paths['/charges'].get.responses[429] = { description: 'rate limited' };
  delete clone.paths['/charges/{id}'];
  return clone;
})();
