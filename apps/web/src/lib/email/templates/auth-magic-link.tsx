import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { APP_NAME } from "@/lib/shared/constants";

export type AuthMagicLinkTemplateProps = {
  email: string;
  signInUrl: string;
  appName?: string;
  logoUrl?: string;
};

const fontFamily =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const styles = {
  body: {
    backgroundColor: "#f5f8ff",
    margin: "0",
    padding: "32px 12px",
    fontFamily,
    color: "#0f172a",
  },
  card: {
    backgroundColor: "#ffffff",
    border: "1px solid #dbe5ff",
    borderRadius: "20px",
    margin: "0 auto",
    maxWidth: "560px",
    overflow: "hidden",
  },
  hero: {
    background:
      "radial-gradient(120% 120% at 50% 0%, #dbeafe 0%, #eff6ff 48%, #ffffff 100%)",
    borderBottom: "1px solid #e2e8f0",
    padding: "32px 28px 22px",
    textAlign: "center" as const,
  },
  logo: {
    borderRadius: "14px",
    display: "block",
    height: "56px",
    margin: "0 auto 14px",
    width: "56px",
  },
  brand: {
    color: "#1e293b",
    fontSize: "14px",
    fontWeight: "600",
    letterSpacing: "0.18px",
    margin: "0",
  },
  heading: {
    color: "#0f172a",
    fontSize: "27px",
    fontWeight: "800",
    letterSpacing: "-0.4px",
    lineHeight: "34px",
    margin: "14px 0 10px",
  },
  heroText: {
    color: "#334155",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 auto",
    maxWidth: "430px",
  },
  content: {
    padding: "28px",
    textAlign: "center" as const,
  },
  text: {
    color: "#0f172a",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 12px",
  },
  ctaWrap: {
    padding: "8px 0 2px",
    textAlign: "center" as const,
  },
  cta: {
    background:
      "linear-gradient(120deg, #0f172a 0%, #1e293b 45%, #0f172a 100%)",
    borderRadius: "12px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: "700",
    letterSpacing: "0.2px",
    padding: "14px 22px",
    textDecoration: "none",
  },
  helper: {
    color: "#475569",
    fontSize: "13px",
    lineHeight: "21px",
    margin: "14px 0 0",
    textAlign: "center" as const,
  },
  helperLink: {
    color: "#1d4ed8",
    textDecoration: "underline",
  },
  rule: {
    borderColor: "#e2e8f0",
    margin: "22px 0 12px",
  },
  footer: {
    color: "#64748b",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "0",
    textAlign: "center" as const,
  },
} as const;

export function AuthMagicLinkTemplate({
  email,
  signInUrl,
  appName = APP_NAME,
  logoUrl,
}: AuthMagicLinkTemplateProps) {
  const safeLogoUrl = logoUrl ?? "http://localhost:3000/favicon.png";

  return (
    <Html>
      <Head />
      <Preview>Sign in to {appName}</Preview>
      <Body style={styles.body}>
        <Container style={styles.card}>
          <Section style={styles.hero}>
            <Img alt={`${appName} logo`} src={safeLogoUrl} style={styles.logo} />
            <Text style={styles.brand}>{appName}</Text>
            <Heading style={styles.heading}>Your sign-in link is ready</Heading>
            <Text style={styles.heroText}>Use this secure magic link to sign in instantly.</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.text}>This sign-in request was made for: {email}</Text>
            <Text style={styles.text}>
              Click the button below to continue. This link can be used only once and expires
              automatically.
            </Text>

            <Section style={styles.ctaWrap}>
              <Button href={signInUrl} style={styles.cta}>
                Sign in to {appName}
              </Button>
            </Section>

            {/* <Text style={styles.helper}>
              If the button does not work, copy and paste this link into your browser:
              <br />
              <Link href={signInUrl} style={styles.helperLink}>
                {signInUrl}
              </Link>
            </Text> */}

            <Hr style={styles.rule} />
            <Text style={styles.footer}>
              If you did not request this email, you can safely ignore it.
            </Text>
            {/* <Text style={styles.footer}>{appName}</Text> */}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

AuthMagicLinkTemplate.PreviewProps = {
  email: "void@example.com",
  signInUrl: "http://localhost:3000/api/auth/callback/nodemailer?token=preview-token",
  logoUrl: "http://localhost:3000/favicon.png",
} satisfies AuthMagicLinkTemplateProps;

export default AuthMagicLinkTemplate;
