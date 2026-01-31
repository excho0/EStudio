"use client";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { AtSignIcon, ChevronLeft, Home } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { FloatingPaths } from "@/components/floating-paths";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "./route-transition";
import { Particles } from "./ui/particles";

type AuthProvider = {
	id: "google" | "github" | "discord";
	label: string;
	icon?: React.ReactNode;
	onClick: () => void;
};

type AuthPageProps = {
	providers: AuthProvider[];
	onMagicLink: (email: string) => void;
	showMagicLink?: boolean;
	showVerificationNotice?: boolean;
	verificationEmail?: string;
	loading?: boolean;
	onVerificationBack?: () => void;
};

export function AuthPage({
	providers,
	onMagicLink,
	showMagicLink = true,
	showVerificationNotice = false,
	verificationEmail,
	loading = false,
	onVerificationBack,
}: AuthPageProps) {
	const [emailValue, setEmailValue] = useState("");
	const normalizedEmail = useMemo(() => emailValue.trim(), [emailValue]);
	const isEmailValid = useMemo(() => {
	if (!normalizedEmail) return false;
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
	}, [normalizedEmail]);
	const handleVerificationBack = () => {
		setEmailValue("");
		(onVerificationBack ?? (() => window.location.reload()))();
	};

	return (
		<AnimatePresence mode="wait">
			{showVerificationNotice ? (
				<motion.main
					key="verify"
					className="relative flex min-h-screen items-center justify-center px-4 py-12"
					initial={{ opacity: 0, y: 18 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -12 }}
					transition={{ duration: 0.45, ease: "easeOut" }}
				>
					<div className="w-full max-w-md text-center">
						<Logo
							width={56}
							height={56}
							wrapperClassName="mx-auto mb-6 h-14 w-14 rounded-full"
							className="h-14 w-14 rounded-full"
						/>
						<div className="space-y-3">
							<h1 className="text-2xl font-semibold">Check your email</h1>
							<p className="text-sm text-muted-foreground">
								We sent a sign-in link to{" "}
								<span className="font-medium text-foreground">
									{verificationEmail ?? "your inbox"}
								</span>
								. Click the link to finish signing in.
							</p>
							<p className="text-xs text-muted-foreground">
								If you don’t see it, check spam or request another link.
							</p>
							<Button
								variant="outline"
								className="mt-4"
								onClick={handleVerificationBack}
							>
								<ChevronLeft />
								Back
							</Button>
						</div>
					</div>
				</motion.main>
			) : (
				<motion.main
					key="login"
					className="relative md:h-screen md:overflow-hidden lg:grid lg:grid-cols-2"
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 12 }}
					transition={{ duration: 0.5, ease: "easeOut" }}
				>
			<div className="relative hidden h-full flex-col border-r bg-secondary p-10 lg:flex dark:bg-secondary/20">
				<div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
				<Logo
					showText
					width={44}
					height={44}
					wrapperClassName="rounded-full"
					className="rounded-full"
				/>

				{/* <div className="z-10 mt-auto">
					<blockquote className="space-y-2">
						<p className="text-xl">
							&ldquo;This Platform has helped me to save time and serve my
							clients faster than ever before.&rdquo;
						</p>
						<footer className="font-mono font-semibold text-sm">
							~ Ali Hassan
						</footer>
					</blockquote>
				</div> */}
				<div className="absolute inset-0">
					<FloatingPaths position={1} />
					<FloatingPaths position={-1} />
				</div>
			</div>
			<div className="relative flex min-h-screen flex-col justify-between p-4">
				<Particles
					className="absolute inset-0 lg:hidden"
					color="#666666"
					ease={20}
					quantity={120}
				/>
				
				<div className="flex justify-center items-center pt-4">
					<Button asChild className="w-fit" variant="ghost">
						<Link href="/">
							<Home />
							Home
						</Link>
					</Button>
				</div>
				<div className="mx-auto space-y-4 sm:w-sm">
					<div className="flex justify-center items-center pb-4 lg:hidden">
						<Logo
							// showText={isTablet}
							width={100}
							height={100}
							wrapperClassName="rounded-full"
							className="rounded-full"
						/>
					</div>

					<div className="flex flex-col space-y-1 items-center text-center justify-center">
						<h1 className="font-bold text-2xl tracking-wide">
							Sign In or Join Now!
						</h1>
						{/* <p className="text-base text-muted-foreground">
							login or create your account.
						</p> */}
					</div>
					<div className="space-y-2">
						{providers.map((provider) => (
							<Button
								key={provider.id}
								className="w-full"
								size="lg"
								type="button"
								onClick={provider.onClick}
								disabled={loading}
							>
								{provider.icon ?? null}
								{provider.label}
							</Button>
						))}
					</div>

					<div className="flex w-full items-center justify-center">
						<div className="h-px w-full bg-border" />
						<span className="px-2 text-muted-foreground text-xs">OR</span>
						<div className="h-px w-full bg-border" />
					</div>

					{showMagicLink ? (
						<form
							className="space-y-2"
							onSubmit={(event) => {
								event.preventDefault();
								if (!isEmailValid) return;
								onMagicLink(normalizedEmail);
							}}
						>
							<p className="text-start text-muted-foreground text-xs">
								Enter your email address to sign in or create an account
							</p>
							<InputGroup>
								<InputGroupInput
									name="email"
									placeholder="your.email@example.com"
									type="email"
									disabled={loading}
									value={emailValue ?? ""}
									onChange={(event) => setEmailValue(event.target.value)}
								/>
								<InputGroupAddon>
									<AtSignIcon />
								</InputGroupAddon>
							</InputGroup>

							<Button
								className="w-full"
								type="submit"
								loading={loading}
								disabled={!isEmailValid || loading}
							>
								Continue With Email
							</Button>
						</form>
					) : null}
					{/* <p className="mt-8 text-muted-foreground text-sm">
						By clicking continue, you agree to our{" "}
						<a
							className="underline underline-offset-4 hover:text-primary"
							href="#"
						>
							Terms of Service
						</a>{" "}
						and{" "}
						<a
							className="underline underline-offset-4 hover:text-primary"
							href="#"
						>
							Privacy Policy
						</a>
						.
					</p> */}
				</div>
				<div></div>
			</div>
				</motion.main>
			)}
		</AnimatePresence>
	);
}

const GoogleIcon = (props: React.ComponentProps<"svg">) => (
	<svg
		fill="currentColor"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<g>
			<path d="M12.479,14.265v-3.279h11.049c0.108,0.571,0.164,1.247,0.164,1.979c0,2.46-0.672,5.502-2.84,7.669   C18.744,22.829,16.051,24,12.483,24C5.869,24,0.308,18.613,0.308,12S5.869,0,12.483,0c3.659,0,6.265,1.436,8.223,3.307L18.392,5.62   c-1.404-1.317-3.307-2.341-5.913-2.341C7.65,3.279,3.873,7.171,3.873,12s3.777,8.721,8.606,8.721c3.132,0,4.916-1.258,6.059-2.401   c0.927-0.927,1.537-2.251,1.777-4.059L12.479,14.265z" />
		</g>
	</svg>
);

const GithubIcon = (props: React.ComponentProps<"svg">) => (
	<svg fill="currentColor" viewBox="0 0 1024 1024" {...props}>
		<path
			clipRule="evenodd"
			d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"
			fill="currentColor"
			fillRule="evenodd"
			transform="scale(64)"
		/>
	</svg>
);

const DiscordIcon = (props: React.ComponentProps<"svg">) => (
	<svg fill="currentColor" viewBox="0 0 24 24" {...props}>
		<path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.444.864-.608 1.249-1.844-.276-3.68-.276-5.486 0-.164-.394-.409-.874-.617-1.249a.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.045-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027c.461-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 13.107 13.107 0 0 1-1.872-.9.077.077 0 0 1-.008-.128c.125-.094.25-.192.369-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.245.198.37.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.899.076.076 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.028 19.86 19.86 0 0 0 6.002-3.03.077.077 0 0 0 .03-.056c.5-5.177-.838-9.673-3.548-13.66a.062.062 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.955 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.419-2.157 2.419z" />
	</svg>
);

export const authProviderIcons = {
	google: <GoogleIcon />,
	github: <GithubIcon />,
	discord: <DiscordIcon />,
};
