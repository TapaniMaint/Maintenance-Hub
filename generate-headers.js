import fs from "fs";
import path from "path";

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, "dist");
const vendorDir = path.join(projectRoot, "vendor");
const vendorBundleFile = path.join(vendorDir, "supabase.js");
const supabaseSourceFile = path.join(
  projectRoot,
  "node_modules",
  "@supabase",
  "supabase-js",
  "dist",
  "umd",
  "supabase.js"
);
const sourceHeadersFile = path.join(projectRoot, "_headers");
const sourceRedirectsFile = path.join(projectRoot, "_redirects");
const distHeadersFile = path.join(distDir, "_headers");
const distRedirectsFile = path.join(distDir, "_redirects");
const staticFiles = [
  "admin.html",
  "admin.js",
  "app.js",
  "index.html",
  "login.html",
  "login.js",
  "styles.css",
  "supabase-client.js",
  "supabase-config.js",
  "theme.js",
  "user.js"
];
const staticDirs = [
  "images",
  "vendor",
  "public"
];

function ensureDist() {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
}

function copyVendorScripts() {
  if (!fs.existsSync(vendorDir)) {
    fs.mkdirSync(vendorDir, { recursive: true });
  }

  fs.copyFileSync(supabaseSourceFile, vendorBundleFile);
  console.log("Copied Supabase client locally.");
}

function copyStaticSite() {
  for (const file of staticFiles) {
    const source = path.join(projectRoot, file);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(distDir, file));
    }
  }

  for (const dir of staticDirs) {
    const source = path.join(projectRoot, dir);
    if (fs.existsSync(source)) {
      fs.cpSync(source, path.join(distDir, dir), { recursive: true });
    }
  }
}

function copyRedirects() {
  if (!fs.existsSync(sourceRedirectsFile)) {
    console.log("_redirects missing at project root, skipping.");
    return;
  }

  fs.copyFileSync(sourceRedirectsFile, distRedirectsFile);
  console.log("Copied _redirects to dist.");
}

function copyHeadersWithOptionalAuthOverride() {
  if (!fs.existsSync(sourceHeadersFile)) {
    console.log("_headers missing at project root, skipping.");
    return;
  }

  let headersContent = fs.readFileSync(sourceHeadersFile, "utf8");
  const basicAuthCredentials = process.env.BASIC_AUTH_CREDENTIALS;

  if (basicAuthCredentials) {
    headersContent = headersContent.replace(
      /Basic-Auth:\s*__BASIC_AUTH_CREDENTIALS__/g,
      `Basic-Auth: ${basicAuthCredentials}`
    );
    console.log("Applied BASIC_AUTH_CREDENTIALS override in _headers.");
  } else {
    throw new Error("BASIC_AUTH_CREDENTIALS must be set before deploying admin routes.");
  }

  fs.writeFileSync(distHeadersFile, headersContent, "utf8");
  console.log("Copied _headers to dist.");
}

function assertDeploymentSecurityChecks() {
  if (process.env.SUPABASE_AUTH_RATE_LIMITS_CONFIRMED !== "true") {
    throw new Error("Set SUPABASE_AUTH_RATE_LIMITS_CONFIRMED=true after enabling Supabase Auth rate limits for this project.");
  }
}

assertDeploymentSecurityChecks();
ensureDist();
copyVendorScripts();
copyStaticSite();
copyRedirects();
copyHeadersWithOptionalAuthOverride();
