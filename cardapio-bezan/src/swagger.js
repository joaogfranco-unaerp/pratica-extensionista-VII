const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const secured = [{ bearerAuth: [] }];
const ok = (desc, schema) => ({ description: desc, content: { 'application/json': { schema } } });
const err = { description: 'Erro', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const body = (ref) => ({ required: true, content: { 'application/json': { schema: { $ref: ref } } } });

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Cardápio Digital - Buffet Bezan',
    version: '1.0.0',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Autenticação' },
    { name: 'Categorias' },
    { name: 'Itens' },
    { name: 'Pedidos' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      Login: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string', example: 'admin@bezan.com' }, password: { type: 'string', example: 'bezan123' } },
      },
      Category: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, position: { type: 'integer' } } },
      ItemInput: {
        type: 'object',
        required: ['category_id', 'name', 'description', 'price'],
        properties: {
          category_id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Coxinha (cento)' },
          description: { type: 'string', example: 'Coxinha de frango com catupiry' },
          ingredients: { type: 'string', example: 'Frango, catupiry, massa' },
          price: { type: 'number', example: 95.0 },
          image: { type: 'string', nullable: true, description: 'URL ou data URL (base64) da imagem' },
        },
      },
      Item: {
        allOf: [
          { $ref: '#/components/schemas/ItemInput' },
          { type: 'object', properties: { id: { type: 'integer' }, category_name: { type: 'string' } } },
        ],
      },
      OrderInput: {
        type: 'object',
        required: ['customer_name', 'items'],
        properties: {
          customer_name: { type: 'string', example: 'Maria' },
          customer_ref: { type: 'string', example: 'Mesa 4 / (16) 99999-0000' },
          notes: { type: 'string', example: 'Retirar às 18h' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['item_id', 'quantity'],
              properties: {
                item_id: { type: 'integer', example: 1 },
                quantity: { type: 'integer', example: 2 },
                notes: { type: 'string', example: 'Sem cebola' },
              },
            },
          },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          customer_name: { type: 'string' },
          customer_ref: { type: 'string' },
          notes: { type: 'string' },
          total: { type: 'number' },
          status: { type: 'string', enum: ['Recebido', 'Em preparo', 'Pronto', 'Entregue'] },
          created_at: { type: 'string', format: 'date-time' },
          items: { type: 'array', items: { type: 'object' } },
          history: {
            type: 'array',
            items: {
              type: 'object',
              properties: { status: { type: 'string' }, changed_by: { type: 'string' }, changed_at: { type: 'string', format: 'date-time' } },
            },
          },
        },
      },
    },
  },
  paths: {
    '/api/auth/login': {
      post: {
        tags: ['Autenticação'],
        summary: 'Login do administrador (retorna JWT)',
        requestBody: body('#/components/schemas/Login'),
        responses: { 200: ok('Token JWT', { type: 'object', properties: { token: { type: 'string' } } }), 401: err },
      },
    },
    '/api/auth/me': {
      get: { tags: ['Autenticação'], summary: 'Dados do usuário logado', security: secured, responses: { 200: ok('Usuário', { type: 'object' }), 401: err } },
    },
    '/api/categories': {
      get: { tags: ['Categorias'], summary: 'Listar categorias', responses: { 200: ok('Lista', { type: 'array', items: { $ref: '#/components/schemas/Category' } }) } },
      post: {
        tags: ['Categorias'],
        summary: 'Criar categoria',
        security: secured,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } },
        responses: { 201: ok('Criada', { $ref: '#/components/schemas/Category' }), 400: err, 401: err },
      },
    },
    '/api/categories/{id}': {
      delete: { tags: ['Categorias'], summary: 'Remover categoria (e seus itens)', security: secured, parameters: [idParam], responses: { 204: { description: 'Removida' }, 404: err } },
    },
    '/api/items': {
      get: {
        tags: ['Itens'],
        summary: 'Listar itens do cardápio',
        parameters: [{ name: 'category', in: 'query', schema: { type: 'integer' }, description: 'Filtrar por categoria' }],
        responses: { 200: ok('Lista', { type: 'array', items: { $ref: '#/components/schemas/Item' } }) },
      },
      post: {
        tags: ['Itens'],
        summary: 'Cadastrar item',
        security: secured,
        requestBody: body('#/components/schemas/ItemInput'),
        responses: { 201: ok('Criado', { $ref: '#/components/schemas/Item' }), 400: err, 401: err },
      },
    },
    '/api/items/{id}': {
      get: { tags: ['Itens'], summary: 'Detalhes de um item', parameters: [idParam], responses: { 200: ok('Item', { $ref: '#/components/schemas/Item' }), 404: err } },
      put: {
        tags: ['Itens'],
        summary: 'Editar item',
        security: secured,
        parameters: [idParam],
        requestBody: body('#/components/schemas/ItemInput'),
        responses: { 200: ok('Atualizado', { $ref: '#/components/schemas/Item' }), 400: err, 404: err },
      },
      delete: { tags: ['Itens'], summary: 'Remover item', security: secured, parameters: [idParam], responses: { 204: { description: 'Removido' }, 404: err } },
    },
    '/api/orders': {
      get: {
        tags: ['Pedidos'],
        summary: 'Listar pedidos (admin)',
        security: secured,
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['Recebido', 'Em preparo', 'Pronto', 'Entregue'] } }],
        responses: { 200: ok('Lista', { type: 'array', items: { $ref: '#/components/schemas/Order' } }), 401: err },
      },
      post: {
        tags: ['Pedidos'],
        summary: 'Enviar pedido (cliente)',
        requestBody: body('#/components/schemas/OrderInput'),
        responses: { 201: ok('Pedido registrado', { $ref: '#/components/schemas/Order' }), 400: err },
      },
    },
    '/api/orders/{id}': {
      get: { tags: ['Pedidos'], summary: 'Detalhes do pedido (admin)', security: secured, parameters: [idParam], responses: { 200: ok('Pedido', { $ref: '#/components/schemas/Order' }), 404: err } },
    },
    '/api/orders/{id}/track': {
      get: { tags: ['Pedidos'], summary: 'Acompanhar status do pedido (cliente)', parameters: [idParam], responses: { 200: ok('Status', { type: 'object' }), 404: err } },
    },
    '/api/orders/{id}/status': {
      patch: {
        tags: ['Pedidos'],
        summary: 'Atualizar status do pedido (grava histórico)',
        security: secured,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['Recebido', 'Em preparo', 'Pronto', 'Entregue'] } } } } },
        },
        responses: { 200: ok('Atualizado', { $ref: '#/components/schemas/Order' }), 400: err, 404: err },
      },
    },
  },
};
