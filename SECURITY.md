# Security Policy

## Supported Versions

Only the current major version is supported for security updates. 

| Version | Supported          |
| ------- | ------------------ |
| v1.0.x  | :white_check_mark: |

## Reporting a Vulnerability

As this is a forensic investigative tool dealing with sensitive privacy data interception (HAR captures, Neo4j graph data, TCString payloads), any vulnerability that could allow Remote Code Execution (RCE) or sensitive data exposure is considered highly critical.

Please do **NOT** open a public issue for security vulnerabilities. 
Instead, report it privately directly to the maintainer via email: nicomumi@gmail.com

We aim to acknowledge receipt of the vulnerability within 48 hours and will prioritize patching and releasing a security advisory.

### Scope
- Malicious payload injection via forged TCStrings.
- Prototype pollution in the graph builder or network sniffer.
- Path traversal when writing `.har` and `.json` evidence files.
