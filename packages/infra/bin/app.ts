import { App } from "aws-cdk-lib";
import { FEATURE_FLAGS, settingsFrom } from "../src/config";
import { definePrimolar } from "../src/primolar";

// Settings: cdk.json "context", or -c key=value (decisions.md I17). A missing or bad one stops synthesis here.
const app = new App({ context: FEATURE_FLAGS });
definePrimolar(app, settingsFrom((key) => app.node.tryGetContext(key)));
