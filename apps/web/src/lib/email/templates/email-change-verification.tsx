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

export type EmailChangeVerificationTemplateProps = {
  greeting: string;
  confirmUrl: string;
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
  logoWrap: {
    margin: "0 auto 14px",
  },
  logo: {
    borderRadius: "14px",
    display: "block",
    height: "56px",
    margin: "0 auto",
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

export function EmailChangeVerificationTemplate({
  greeting,
  confirmUrl,
  appName = APP_NAME,
  logoUrl,
}: EmailChangeVerificationTemplateProps) {
  const safeLogoUrl = logoUrl ?? "http://localhost:3000/favicon.png";

  return (
    <Html>
      <Head />
      <Preview>Confirm your new email for {appName}</Preview>
      <Body style={styles.body}>
        <Container style={styles.card}>
          <Section style={styles.hero}>
            <Section style={styles.logoWrap}>
              <Img alt={`${appName} logo`} src={safeLogoUrl} style={styles.logo} />
            </Section>
            <Text style={styles.brand}>{appName}</Text>
            <Heading style={styles.heading}>Confirm your new email</Heading>
            <Text style={styles.heroText}>
              Keep your account secure by confirming this email address change.
            </Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.text}>{greeting}</Text>
            <Text style={styles.text}>
              We received a request to change the email connected to your {appName} account.
              If this was you, confirm below to finish the update.
            </Text>

            <Section style={styles.ctaWrap}>
              <Button href={confirmUrl} style={styles.cta}>
                Confirm new email address
              </Button>
            </Section>

            {/* <Text style={styles.helper}>
              If the button does not work, copy and paste this link into your browser:
              <br />
              <Link href={confirmUrl} style={styles.helperLink}>
                {confirmUrl}
              </Link>
            </Text> */}

            <Hr style={styles.rule} />
            <Text style={styles.footer}>
              If you did not request this change, you can safely ignore this email.
            </Text>
            {/* <Text style={styles.footer}>{appName}</Text> */}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

EmailChangeVerificationTemplate.PreviewProps = {
  greeting: "Hi Void,",
  confirmUrl: "http://localhost:3000/api/user/profile/confirm-email?token=preview-token",
  logoUrl: "http://localhost:3000/favicon.png",
} satisfies EmailChangeVerificationTemplateProps;

export default EmailChangeVerificationTemplate;