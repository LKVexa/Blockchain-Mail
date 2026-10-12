# Third-party and source provenance

The selected local desk uses React, ReactDOM and Scheduler wrappers extracted from the supplied candidate's already-compiled bundle. The unchanged extraction boundary and source/output digests are recorded in `provenance/REACT_EXTRACTION.json`. The appended exports are integration code. The vendor self-reports 19.3.0; no claim is made that this identifies an independently verified published package. The original full bundle is retained for provenance, not executed by the local route.

The React MIT notice is included at `desk/vendor/LICENSE.react.txt`, transcribed from the official repository at https://raw.githubusercontent.com/facebook/react/main/LICENSE on October 6, 2026. This notice does not determine the licensing of the user's separate original application or confer a new blanket license on it. Original candidate headers and source copies are retained. No font files or runtime binaries are distributed.

Node.js is separately supplied by the operator. The optional Windows setup copies Node's own LICENSE alongside the verified executable. Its reproduction pin and source are in `provenance/RUNTIME_PIN.json`; it is not a recommendation to deploy an old runtime in production. No npm installation occurs in ordinary startup.
