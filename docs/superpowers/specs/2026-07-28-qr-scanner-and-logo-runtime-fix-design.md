# QR Scanner and Logo Runtime Fix Design

## Goal

Make the HYFIT Games logo render reliably in local and Railway builds, and let a judge scan a numeric BIB QR code from the participant search screen to select the matching cached participant.

## Logo delivery

The existing HYFIT Games PNG remains the only brand asset. The current Vinext image-optimization route returns HTTP 400 even though the source asset returns HTTP 200. Each `next/image` use of the local logo will therefore opt out of runtime optimization and serve `/branding/hyfit-games-logo.png` directly. The application icon already uses the direct asset path.

## QR scanner experience

The participant search screen will include a prominent **Scan wristband QR** button while retaining manual BIB/name search. Activating it opens an accessible modal and requests the rear-facing camera only after that user action.

The scanner will:

- decode QR codes with `@zxing/browser` for broader browser support than the native `BarcodeDetector` API;
- trim the decoded text and accept only one or more ASCII digits;
- match the value exactly against the current locally cached participant list;
- stop the camera and pass a matching participant through the existing `chooseAthlete` flow;
- show a clear retry message for a nonnumeric QR or unknown BIB;
- prevent repeated callbacks for the same camera frame;
- provide close and manual-search fallback controls.

If the participant is already on course, the existing participant-selection rule remains authoritative. Camera permission denial, missing camera hardware, and insecure-context failures will produce actionable messages without breaking manual search.

## Components and data flow

`app/qr-scanner.tsx` owns camera setup, QR decoding, modal controls, error state, and media-track cleanup. It emits only decoded text and does not know participant data.

`app/participants.ts` gains a pure numeric-BIB parsing and exact-lookup helper. `app/page.tsx` owns the modal state, resolves scans against its current participant cache, and invokes the existing athlete selection logic.

The camera and decoder are stopped when a scan succeeds, the modal closes, the component unmounts, or the participant-search screen is left.

## Security and deployment

Browser camera access requires a secure context. It will work on `localhost` during development and on Railway over HTTPS. No QR contents, video frames, or camera data are persisted or sent to a server.

## Verification

Automated tests will cover numeric-only parsing and exact BIB lookup. Lint, production build, and the existing full test suite must pass. Runtime verification will confirm:

- the logo source is direct and returns HTTP 200;
- the obsolete `_vinext/image` logo URL is absent;
- the scanner opens from participant search;
- manual participant search still works;
- the local production server remains running after verification.
