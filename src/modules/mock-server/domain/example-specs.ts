/**
 * Documents the import panel can fill itself with.
 *
 * A blank paste box is the worst place to meet an importer: the reader has to
 * go and find a specification before they can see what the tool does with one,
 * and the specification they find is usually the petstore — which declares
 * nothing required, carries no headers and produces ten routes that answer 200
 * to anything. That is precisely the shape this importer is least interesting
 * on.
 *
 * So the example that ships is a real payment gateway. It has the three things
 * a petstore does not: headers every call must carry, a request body with
 * required fields, and query parameters that are not optional. Importing it
 * shows the guard node being built, which is the part somebody evaluating this
 * tool needs to see.
 *
 * Held as text rather than as an object, and the reason is that the box is a
 * *paste* box: the reader is meant to see the document, edit it if they like,
 * and press Import — so what they get has to be the same characters they would
 * have pasted. It is also why this is not fetched: about fifteen kilobytes,
 * which is two and a half over the wire, and a round trip to save that is a
 * round trip that can fail.
 */

/**
 * How many tiles the picker shows in total, filled ones included.
 *
 * Anything past what `EXAMPLE_SPECS` holds renders as a marked-empty slot rather
 * than being left out, so the row reads as a shelf with room on it — and each
 * placeholder disappears as a real entry takes its place. Adding an example is
 * an entry in `EXAMPLE_SPECS` plus its two message keys per locale; nothing in
 * the panel changes.
 */
export const EXAMPLE_SLOTS = 4;

export const EXAMPLE_SPEC_IDS = ["bkash-subscription"] as const;

export type ExampleSpecId = (typeof EXAMPLE_SPEC_IDS)[number];

export type ExampleSpec = {
    readonly id: ExampleSpecId;
    /** What the created server is called when the reader does not name it. */
    readonly serverName: string;
    /**
     * The organisation's own mark, under `public/organizations/`.
     *
     * Intrinsic dimensions travel with it because `next/image` needs both to
     * reserve the box before the file arrives — a logo that pops in and reflows
     * a row of tiles is the layout shift this field exists to prevent.
     *
     * Rendered with an empty `alt`: the organisation's name is the line
     * underneath it, and a screen reader announcing it twice is noise.
     */
    readonly logo: { readonly src: string; readonly width: number; readonly height: number };
    /**
     * What the tile says the document holds.
     *
     * Written down rather than counted at render: the count needs the `$ref`
     * pointers resolved, which is a server-only pass, and parsing twenty
     * kilobytes of JSON to put two numbers on a tile is work every reader of
     * this page would pay for. `example-specs.test.ts` asserts both against the
     * document itself, so a stale number fails a test rather than shipping.
     */
    readonly operations: number;
    readonly requiredFields: number;
    readonly document: string;
};

/**
 * bKash's recurring-payment gateway, as its own generated OpenAPI document.
 *
 * Reproduced rather than paraphrased. The value of an example is that it is the
 * thing somebody will actually import — a tidied-up version would not have the
 * `SubscriptionExtendRequestDto` naming, the three-header preamble on every
 * operation or the `int64` identifiers, and those are the details that make an
 * import look right or wrong.
 */
const BKASH_SUBSCRIPTION = `{
  "openapi": "3.0.1",
  "info": {
    "title": "gateway",
    "description": "bKash Limited - https://developer.bka.sh - developer@bkash.com",
    "version": "0.0.1-SNAPSHOT"
  },
  "servers": [
    {
      "url": "http://gateway.uatrecurring.pay.bka.sh/gateway",
      "description": "Generated server url"
    }
  ],
  "paths": {
    "/api/subscription": {
      "put": {
        "tags": ["subscription-controller"],
        "operationId": "extend",
        "parameters": [
          { "name": "version", "in": "header", "required": true, "schema": { "type": "string" } },
          { "name": "channelId", "in": "header", "required": true, "schema": { "type": "string" } },
          {
            "name": "timeStamp",
            "in": "header",
            "required": true,
            "schema": { "type": "string", "format": "date-time" }
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/SubscriptionExtendRequestDto" }
            }
          },
          "required": true
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/SubscriptionExtendResponseDto" }
              }
            }
          }
        }
      },
      "post": {
        "tags": ["subscription-controller"],
        "operationId": "create",
        "parameters": [
          { "name": "version", "in": "header", "required": true, "schema": { "type": "string" } },
          { "name": "channelId", "in": "header", "required": true, "schema": { "type": "string" } },
          {
            "name": "timeStamp",
            "in": "header",
            "required": true,
            "schema": { "type": "string", "format": "date-time" }
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/SubscriptionRequestDto" }
            }
          },
          "required": true
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/SubscriptionResponseDto" }
              }
            }
          }
        }
      }
    },
    "/api/subscription/payment/refund": {
      "post": {
        "tags": ["payment-controller"],
        "operationId": "refund",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/MerchantRefundDto" }
            }
          },
          "required": true
        },
        "responses": { "200": { "description": "OK" } }
      }
    },
    "/api/subscriptions/{page}/{size}": {
      "get": {
        "tags": ["subscription-controller"],
        "operationId": "findByAll",
        "parameters": [
          {
            "name": "page",
            "in": "path",
            "required": true,
            "schema": { "type": "integer", "format": "int32" }
          },
          {
            "name": "size",
            "in": "path",
            "required": true,
            "schema": { "type": "integer", "format": "int32" }
          },
          { "name": "version", "in": "header", "required": true, "schema": { "type": "string" } },
          { "name": "channelId", "in": "header", "required": true, "schema": { "type": "string" } },
          {
            "name": "timeStamp",
            "in": "header",
            "required": true,
            "schema": { "type": "string", "format": "date-time" }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PaginatedResponseDtoSubscriptionGatewaySubscriptionDto"
                }
              }
            }
          }
        }
      }
    },
    "/api/subscriptions/{id}": {
      "get": {
        "tags": ["subscription-controller"],
        "operationId": "findById",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "integer", "format": "int64" }
          },
          { "name": "version", "in": "header", "required": true, "schema": { "type": "string" } },
          { "name": "channelId", "in": "header", "required": true, "schema": { "type": "string" } },
          {
            "name": "timeStamp",
            "in": "header",
            "required": true,
            "schema": { "type": "string", "format": "date-time" }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": { "schema": { "$ref": "#/components/schemas/Subscription" } }
            }
          }
        }
      },
      "delete": {
        "tags": ["subscription-controller"],
        "operationId": "cancel",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "integer", "format": "int64" }
          },
          { "name": "reason", "in": "query", "required": true, "schema": { "type": "string" } },
          { "name": "version", "in": "header", "required": true, "schema": { "type": "string" } },
          { "name": "channelId", "in": "header", "required": true, "schema": { "type": "string" } },
          {
            "name": "timeStamp",
            "in": "header",
            "required": true,
            "schema": { "type": "string", "format": "date-time" }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/SubscriptionCancelResponseDto" }
              }
            }
          }
        }
      }
    },
    "/api/subscriptions/request-id/{requestId}": {
      "get": {
        "tags": ["subscription-controller"],
        "operationId": "findByRequestId",
        "parameters": [
          { "name": "requestId", "in": "path", "required": true, "schema": { "type": "string" } },
          { "name": "version", "in": "header", "required": true, "schema": { "type": "string" } },
          { "name": "channelId", "in": "header", "required": true, "schema": { "type": "string" } },
          {
            "name": "timeStamp",
            "in": "header",
            "required": true,
            "schema": { "type": "string", "format": "date-time" }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": { "schema": { "$ref": "#/components/schemas/Subscription" } }
            }
          }
        }
      }
    },
    "/api/subscription/payment/{id}": {
      "get": {
        "tags": ["payment-controller"],
        "operationId": "findById_1",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "integer", "format": "int64" }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": { "schema": { "$ref": "#/components/schemas/GatewayPaymentDto" } }
            }
          }
        }
      }
    },
    "/api/subscription/payment/schedule": {
      "get": {
        "tags": ["subscription-controller"],
        "operationId": "getSchedule",
        "parameters": [
          {
            "name": "frequency",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "enum": [
                "DAILY",
                "WEEKLY",
                "FIFTEEN_DAYS",
                "THIRTY_DAYS",
                "NINETY_DAYS",
                "ONE_EIGHTY_DAYS",
                "CALENDAR_MONTH",
                "CALENDAR_YEAR"
              ]
            }
          },
          {
            "name": "startDate",
            "in": "query",
            "required": true,
            "schema": { "type": "string", "format": "date" }
          },
          {
            "name": "expiryDate",
            "in": "query",
            "required": true,
            "schema": { "type": "string", "format": "date" }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": { "schema": { "$ref": "#/components/schemas/ScheduleInfoDto" } }
            }
          }
        }
      }
    },
    "/api/subscription/payment/bySubscriptionId/{subscriptionId}": {
      "get": {
        "tags": ["payment-controller"],
        "operationId": "findBySubscriptionId",
        "parameters": [
          {
            "name": "subscriptionId",
            "in": "path",
            "required": true,
            "schema": { "type": "integer", "format": "int64" }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/GatewayPaymentDto" }
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "SubscriptionExtendRequestDto": {
        "type": "object",
        "properties": {
          "subscriptionId": { "type": "integer", "format": "int64" },
          "extendedDate": { "type": "string", "format": "date" },
          "reasonForExtension": { "type": "string" }
        }
      },
      "SubscriptionExtendResponseDto": {
        "type": "object",
        "properties": {
          "subscriptionId": { "type": "integer", "format": "int64" },
          "subscriptionStatus": {
            "type": "string",
            "enum": ["INITIALIZED", "VERIFIED", "SUCCEEDED", "FAILED", "CANCELLED"]
          },
          "startDate": { "type": "string", "format": "date" },
          "previousEndDate": { "type": "string", "format": "date" },
          "extendedEndDate": { "type": "string", "format": "date" },
          "nextPaymentDate": { "type": "string", "format": "date" },
          "message": { "type": "string" },
          "timeStamp": { "type": "string", "format": "date-time" }
        }
      },
      "SubscriptionRequestDto": {
        "required": [
          "currency",
          "firstPaymentIncludedInCycle",
          "maxCapRequired",
          "payerType",
          "paymentType",
          "serviceId",
          "subscriptionType"
        ],
        "type": "object",
        "properties": {
          "subscriptionRequestId": { "type": "string" },
          "serviceId": { "type": "integer", "format": "int64" },
          "subscriptionReference": { "type": "string" },
          "paymentType": { "type": "string", "enum": ["FLEXIBLE", "FIXED", "MIXED"] },
          "subscriptionType": {
            "type": "string",
            "enum": ["BASIC", "WITH_PAYMENT", "WITH_AUTH_CAPTURE"]
          },
          "amountQueryUrl": { "type": "string" },
          "amount": { "minimum": 1, "exclusiveMinimum": false, "type": "number" },
          "firstPaymentAmount": { "minimum": 1, "exclusiveMinimum": false, "type": "number" },
          "maxCapRequired": { "type": "boolean" },
          "maxCapAmount": { "type": "number" },
          "frequency": {
            "type": "string",
            "enum": [
              "DAILY",
              "WEEKLY",
              "FIFTEEN_DAYS",
              "THIRTY_DAYS",
              "NINETY_DAYS",
              "ONE_EIGHTY_DAYS",
              "CALENDAR_MONTH",
              "CALENDAR_YEAR"
            ]
          },
          "startDate": { "type": "string", "format": "date" },
          "expiryDate": { "type": "string", "format": "date" },
          "merchantShortCode": { "type": "string" },
          "redirectUrl": { "type": "string" },
          "payerType": { "type": "string", "enum": ["CUSTOMER", "MERCHANT"] },
          "payer": { "type": "string" },
          "currency": { "type": "string", "enum": ["BDT"] },
          "firstPaymentIncludedInCycle": { "type": "boolean" },
          "extraParams": { "type": "object", "additionalProperties": { "type": "object" } }
        }
      },
      "SubscriptionResponseDto": {
        "type": "object",
        "properties": {
          "subscriptionRequestId": { "type": "string" },
          "redirectURL": { "type": "string" },
          "expirationTime": { "type": "string", "format": "date-time" },
          "timeStamp": { "type": "string", "format": "date-time" }
        }
      },
      "MerchantRefundDto": {
        "required": ["amount", "paymentId"],
        "type": "object",
        "properties": {
          "paymentId": { "type": "integer", "format": "int64" },
          "amount": { "minimum": 1, "exclusiveMinimum": false, "type": "number" }
        }
      },
      "GatewaySubscriptionDto": {
        "type": "object",
        "properties": {
          "id": { "type": "integer", "format": "int64" },
          "subscriptionRequestId": { "type": "string" },
          "merchantId": { "type": "integer", "format": "int64" },
          "merchantShortCode": { "type": "string" },
          "payer": { "type": "string" },
          "amount": { "type": "number" },
          "startDate": { "type": "string", "format": "date" },
          "expiryDate": { "type": "string", "format": "date" },
          "frequency": {
            "type": "string",
            "enum": [
              "DAILY",
              "WEEKLY",
              "FIFTEEN_DAYS",
              "THIRTY_DAYS",
              "NINETY_DAYS",
              "ONE_EIGHTY_DAYS",
              "CALENDAR_MONTH",
              "CALENDAR_YEAR"
            ]
          },
          "status": {
            "type": "string",
            "enum": ["INITIALIZED", "VERIFIED", "SUCCEEDED", "FAILED", "CANCELLED"]
          },
          "cancelledBy": { "type": "string" },
          "cancelledTime": { "type": "string", "format": "date-time" }
        }
      },
      "PaginatedResponseDtoSubscriptionGatewaySubscriptionDto": {
        "type": "object",
        "properties": {
          "size": { "type": "integer", "format": "int32" },
          "totalElements": { "type": "integer", "format": "int64" },
          "totalPages": { "type": "integer", "format": "int32" },
          "content": {
            "type": "array",
            "items": { "$ref": "#/components/schemas/GatewaySubscriptionDto" }
          },
          "currentPage": { "type": "integer", "format": "int32" }
        }
      },
      "Subscription": {
        "required": [
          "createdAt",
          "currency",
          "maxCapRequired",
          "merchantId",
          "modifiedAt",
          "payerType",
          "paymentType",
          "requesterId",
          "serviceId",
          "status",
          "subscriptionRequestId",
          "subscriptionType"
        ],
        "type": "object",
        "properties": {
          "id": { "type": "integer", "format": "int64" },
          "createdAt": { "type": "string", "format": "date-time" },
          "modifiedAt": { "type": "string", "format": "date-time" },
          "subscriptionRequestId": { "type": "string" },
          "requesterId": { "type": "integer", "format": "int64" },
          "serviceId": { "type": "integer", "format": "int64" },
          "paymentType": { "type": "string", "enum": ["FLEXIBLE", "FIXED", "MIXED"] },
          "subscriptionType": {
            "type": "string",
            "enum": ["BASIC", "WITH_PAYMENT", "WITH_AUTH_CAPTURE"]
          },
          "amountQueryUrl": { "type": "string" },
          "amount": { "type": "number" },
          "firstPaymentAmount": { "type": "number" },
          "maxCapRequired": { "type": "boolean" },
          "maxCapAmount": { "type": "number" },
          "frequency": {
            "type": "string",
            "enum": [
              "DAILY",
              "WEEKLY",
              "FIFTEEN_DAYS",
              "THIRTY_DAYS",
              "NINETY_DAYS",
              "ONE_EIGHTY_DAYS",
              "CALENDAR_MONTH",
              "CALENDAR_YEAR"
            ]
          },
          "startDate": { "type": "string", "format": "date" },
          "expiryDate": { "type": "string", "format": "date" },
          "merchantId": { "type": "integer", "format": "int64" },
          "payerType": { "type": "string", "enum": ["CUSTOMER", "MERCHANT"] },
          "payer": { "type": "string" },
          "currency": { "type": "string", "enum": ["BDT"] },
          "nextPaymentDate": { "type": "string", "format": "date" },
          "status": {
            "type": "string",
            "enum": ["INITIALIZED", "VERIFIED", "SUCCEEDED", "FAILED", "CANCELLED"]
          },
          "subscriptionReference": { "type": "string" },
          "extraParams": { "type": "object", "additionalProperties": { "type": "object" } },
          "cancelledBy": { "type": "string" },
          "cancelledTime": { "type": "string", "format": "date-time" },
          "enabled": { "type": "boolean" },
          "expired": { "type": "boolean" },
          "rrule": { "type": "string" },
          "active": { "type": "boolean" }
        }
      },
      "GatewayPaymentDto": {
        "type": "object",
        "properties": {
          "id": { "type": "integer", "format": "int64" },
          "subscriptionId": { "type": "integer", "format": "int64" },
          "dueDate": { "type": "string", "format": "date" },
          "status": {
            "type": "string",
            "enum": [
              "INITIALIZED",
              "PROCESSING_PAYMENT",
              "PROCESSING_REFUND",
              "SUCCEEDED_PAYMENT",
              "SUCCEEDED_REFUND",
              "FAILED_PAYMENT",
              "FAILED_REFUND",
              "RE_SUCCEEDED_PAYMENT",
              "RE_SUCCEEDED_REFUND",
              "RE_FAILED_PAYMENT",
              "RE_FAILED_REFUND",
              "RE_NOT_FOUND_PAYMENT",
              "RE_NOT_FOUND_REFUND"
            ]
          },
          "trxId": { "type": "string" },
          "trxTime": { "type": "string", "format": "date-time" },
          "amount": { "type": "number" },
          "reverseTrxAmount": { "type": "number" },
          "reverseTrxId": { "type": "string" },
          "reverseTrxTime": { "type": "string", "format": "date-time" }
        }
      },
      "ScheduleInfoDto": {
        "type": "object",
        "properties": {
          "count": { "type": "integer", "format": "int32" },
          "dates": { "type": "array", "items": { "type": "string", "format": "date" } }
        }
      },
      "SubscriptionCancelResponseDto": {
        "type": "object",
        "properties": {
          "subscriptionId": { "type": "integer", "format": "int64" },
          "subscriptionStatus": {
            "type": "string",
            "enum": ["INITIALIZED", "VERIFIED", "SUCCEEDED", "FAILED", "CANCELLED"]
          },
          "message": { "type": "string" },
          "instant": { "type": "string", "format": "date-time" }
        }
      }
    }
  }
}`;

export const EXAMPLE_SPECS: readonly ExampleSpec[] = [
    {
        id: "bkash-subscription",
        serverName: "bKash subscription gateway",
        // `bkash-mark.webp`, not `bkash.webp`. The one supplied had been
        // flattened onto black, which made the dark half of the wordmark
        // black-on-black — 1.2:1 against its own background, and a solid black
        // rectangle on any light surface. The mark is that file with the
        // background keyed back out, scaled to a few times what the tile's
        // 16px-tall chip needs so it stays sharp on a dense screen.
        logo: { src: "/organizations/bkash-mark.webp", width: 473, height: 220 },
        operations: 10,
        requiredFields: 31,
        document: BKASH_SUBSCRIPTION,
    },
];

export function findExampleSpec(id: string): ExampleSpec | null {
    return EXAMPLE_SPECS.find((spec) => spec.id === id) ?? null;
}
