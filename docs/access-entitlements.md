# Access and Entitlements

Supabase access-code records are the source of truth for account access and commercial entitlements. Local profile values and test fixtures can mirror those decisions for development, but production behaviour should derive from the access record and capability mapping.

## Account Levels

- Free account: can use myBishBash with one verified enabled app.
- Full Access: can use myBishBash with multiple apps.
- Premium or Full Access content: can use premium packs/content when the entitlement grants that capability.
- Tester access: unlocks tester tools only. It is separate from commercial entitlement and should not be treated as paid access.

## Capability Boundaries

Use capability checks such as `CAN_USE_MULTIPLE_APPS` and `CAN_USE_PREMIUM_CONTENT` for product behaviour. Do not gate ordinary UI on tester cohort, grant reason, or internal campaign labels unless the feature is genuinely tester-only.

Pending app setup is not a verified enabled app. It should be displayed as pending setup and should not be counted against the Free one-app allowance unless the product explicitly changes to reserve a pending slot.

## Access-Code Records

Each code should document:

- Code
- Audience
- Entitlement or capabilities granted
- Expiry
- Usage limit
- Notes

Do not hardcode real private access codes into public docs unless they are already public campaign codes.
