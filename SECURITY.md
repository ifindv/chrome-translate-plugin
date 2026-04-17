# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please do not open a public issue. Instead, send an email to security@quicktranslate.com.

Please include:
- A description of the vulnerability
- Steps to reproduce the issue
- Any potential impact or exploit scenarios
- If possible, a suggested fix

We will:
- Acknowledge receipt of your report within 48 hours
- Provide a detailed response within 7 days
- Work with you to understand and resolve the issue
- Notify you when the fix has been released

## Security Best Practices

For Users:
- Only install the extension from official sources (Chrome Web Store)
- Keep the extension updated to the latest version
- Review the permissions requested by the extension
- Report any suspicious behavior

For Developers:
- Follow secure coding practices
- Keep dependencies updated
- Perform regular security audits
- Test for common vulnerabilities (XSS, CSRF, etc.)
- Never commit sensitive information (API keys, secrets)

## Security Features

This extension implements several security measures:
- Content Security Policy (CSP)
- Secure API communication
- Input validation and sanitization
- No tracking or data collection without user consent
- Minimal required permissions

## Dependency Security

We regularly audit and update our dependencies. To check for vulnerabilities:

```bash
npm audit
```

To update dependencies:

```bash
npm update
```
