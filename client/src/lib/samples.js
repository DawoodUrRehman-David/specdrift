export const sampleBefore = `openapi: 3.0.3
info:
  title: Payments API
  version: 1.4.0
paths:
  /charges:
    get:
      summary: List charges
      parameters:
        - name: limit
          in: query
          required: false
          schema: { type: integer, maximum: 100 }
      responses:
        "200":
          description: A page of charges
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/Charge" }
        "400":
          description: Bad request
    post:
      summary: Create a charge
      security:
        - bearerAuth: [charges:write]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Charge" }
      responses:
        "201": { description: Created }
  /charges/{id}:
    get:
      summary: Get one charge
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        "200": { description: One charge }
        "404": { description: Not found }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
  schemas:
    Charge:
      type: object
      required: [id, amount]
      properties:
        id: { type: string, format: uuid }
        amount: { type: integer, minimum: 1 }
        currency: { type: string, enum: [usd, eur] }
        receipt: { type: string, nullable: true }
`;

export const sampleAfter = `openapi: 3.0.3
info:
  title: Payments API
  version: 2.0.0
paths:
  /charges:
    get:
      summary: List charges
      parameters:
        - name: limit
          in: query
          required: false
          schema: { type: integer, maximum: 100 }
        - name: account
          in: query
          required: true
          schema: { type: string }
      responses:
        "200":
          description: A page of charges
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/Charge" }
        "400":
          description: Bad request
        "429":
          description: Rate limited
    post:
      summary: Create a charge
      security:
        - bearerAuth: [charges:write, charges:admin]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Charge" }
      responses:
        "201": { description: Created }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
  schemas:
    Charge:
      type: object
      required: [id, amount]
      properties:
        id: { type: string, format: uuid }
        amount: { type: string }
        currency: { type: string, enum: [usd, eur] }
        discount: { type: number }
`;
