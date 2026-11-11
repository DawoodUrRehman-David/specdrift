# Rule reference

Every rule SpecDrift can emit, what it means for an existing client, and a minimal example.

Severity is assigned per rule, not guessed: **breaking** means a correctly written client can start
failing after the change; **additive** means new surface area with no breakage; **cosmetic** means
documentation text.

## Operations

| Rule | Severity | Trigger |
| --- | --- | --- |
| `operation.removed` | breaking | A path or method present in the old document is gone |
| `operation.added` | additive | A new path or method |
| `operation.deprecated` | additive | `deprecated: true` newly set |
| `operation.summary-changed` | cosmetic | `summary` text edited |

## Parameters

| Rule | Severity | Trigger |
| --- | --- | --- |
| `parameter.added-required` | breaking | New parameter with `required: true` |
| `parameter.added-optional` | additive | New parameter, not required |
| `parameter.became-required` | breaking | `required` flipped to true |
| `parameter.became-optional` | additive | `required` flipped to false |
| `parameter.removed` | breaking if it was required, additive otherwise | Parameter gone |

Parameter schemas are compared with the full schema rule set below.

## Request bodies

| Rule | Severity | Trigger |
| --- | --- | --- |
| `request-body.added-required` | breaking | Body introduced with `required: true` |
| `request-body.added-optional` | additive | Optional body introduced |
| `request-body.became-required` | breaking | `required` flipped to true |
| `request-body.removed` | breaking | Body removed entirely |
| `request-body.media-type-removed` | breaking | e.g. `application/json` no longer accepted |
| `request-body.media-type-added` | additive | New accepted media type |

## Responses

| Rule | Severity | Trigger |
| --- | --- | --- |
| `response.removed` | breaking | Status code no longer documented |
| `response.added` | additive | New status code |
| `response.media-type-removed` | breaking | Media type dropped from a response |
| `response.media-type-added` | additive | Media type added to a response |

## Schemas

Applied recursively to every schema under `components.schemas`, parameters, request bodies and
responses. `$ref` is resolved locally before comparison.

| Rule | Severity | Trigger |
| --- | --- | --- |
| `schema.property-removed` | breaking | Property deleted |
| `schema.property-added` | breaking if listed in `required`, else additive | Property added |
| `schema.required-added` | breaking | Field promoted to required |
| `schema.required-removed` | additive | Field no longer required |
| `schema.type-changed` | breaking | `integer` → `string`, etc. Comparison stops here |
| `schema.enum-value-removed` | breaking | A previously valid value disappears |
| `schema.enum-value-added` | additive (breaking if an enum constraint is introduced where none existed) | New value |
| `schema.nullable-removed` | breaking | Field no longer accepts `null` |
| `schema.format-changed` | breaking | e.g. `uuid` → `email` |
| `schema.constraint-changed` | breaking if tightened, additive if relaxed | `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems` |
| `schema.additional-properties-forbidden` | breaking | `additionalProperties` set to `false` |
| `schema.default-changed` | cosmetic | Default value changed |
| `schema.variant-added` | breaking for `allOf`, additive for `anyOf`/`oneOf` | Composition variant added |
| `schema.variant-removed` | breaking | Composition variant removed |

## Security

| Rule | Severity | Trigger |
| --- | --- | --- |
| `operation.security-added` | breaking | Authentication newly required |
| `operation.security-removed` | additive | Authentication dropped |
| `operation.security-scheme-added` | breaking | An additional scheme is now demanded |
| `operation.security-scheme-removed` | additive | A scheme is no longer accepted |
| `operation.scope-added` | breaking | Requirement now asks for a scope it did not before |
| `operation.scope-removed` | additive | Requirement asks for fewer scopes |

If the new operation does not declare `security` at all, SpecDrift stays silent: the operation
inherits the document-level requirement, which cannot be evaluated from the operation alone.

## Components and info

| Rule | Severity | Trigger |
| --- | --- | --- |
| `component-schema.added` | additive | New reusable schema |
| `component-schema.removed` | breaking | Reusable schema deleted |
| `info.version-changed` | cosmetic | `info.version` edited |
| `info.title-changed` / `info.description-changed` | cosmetic | Metadata edited |

## Version verdict

| Highest severity present | Verdict |
| --- | --- |
| breaking | major |
| additive | minor |
| cosmetic | patch |
| none | none (no change) |

---

## Worked example

```yaml
# before                                # after
properties:                             properties:
  amount: { type: integer }     →         amount: { type: string }
  receipt: { type: string }     →         discount: { type: number }
required: [id]                  →       required: [id, amount]
```

```console
$ specdrift before.yaml after.yaml --from-version 1.4.0
- **… › amount** — Type changed from integer to string …      breaking
- **… › receipt** — Property "receipt" was removed.             breaking
- **… › discount** — New optional property "discount" added.    additive
- **… › required** — "amount" became required.                  breaking

Suggested release: major → 2.0.0
```
