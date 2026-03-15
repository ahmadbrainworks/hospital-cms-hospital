import { describe, it, expect } from "vitest";
import { assertSafeUrl, SsrfError } from "../middleware/ssrf-guard";

function safe(url: string) {
  expect(() => assertSafeUrl(url)).not.toThrow();
}

function blocked(url: string) {
  expect(() => assertSafeUrl(url)).toThrow(SsrfError);
}

describe("assertSafeUrl", () => {
  //  Allowed public URLs
  it("allows public HTTPS URLs", () => {
    safe("https://example.com/resource");
    safe("https://cdn.vendor.io/plugin-1.0.0.zip");
    safe("https://198.51.100.1/data"); // TEST-NET-2, public
  });

  //  Loopback
  it("blocks 127.x.x.x", () => blocked("https://127.0.0.1/secret"));
  it("blocks localhost", () => blocked("https://localhost/secret"));
  it("blocks LOCALHOST (case insensitive)", () => blocked("http://LOCALHOST/"));

  //  Private RFC1918
  it("blocks 10.0.0.0/8", () => blocked("https://10.0.0.1/internal"));
  it("blocks 10.255.255.255", () => blocked("https://10.255.255.255/"));
  it("blocks 172.16.x.x", () => blocked("https://172.16.0.1/admin"));
  it("blocks 172.31.x.x", () => blocked("https://172.31.255.255/"));
  it("blocks 192.168.x.x", () => blocked("https://192.168.1.100/"));

  //  Link-local
  it("blocks 169.254.x.x (link-local)", () => blocked("https://169.254.0.1/"));
  it("blocks AWS IMDS endpoint", () =>
    blocked("http://169.254.169.254/latest/meta-data/"));

  //  Non-HTTP protocols
  it("blocks file:// protocol", () => blocked("file:///etc/passwd"));
  it("blocks ftp:// protocol", () => blocked("ftp://example.com/data"));
  it("blocks javascript: protocol", () => blocked("javascript:alert(1)"));

  //  Invalid URLs
  it("blocks malformed URL", () => blocked("not-a-url"));
  it("blocks empty string", () => blocked(""));
});
