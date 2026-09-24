import React, { useMemo } from "react";
import { HashRouter, Routes, Route, useParams, useLocation } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import { AppShell } from "@/components/Navigation";
import { GlobalModals } from "@/components/Modals";
import RouteError from "@/app/error";

import HomePage from "@/app/page";
import AuthCallbackPage from "@/app/auth/callback/page";
import AuthGoogleRedirectPage from "@/app/auth/google/page";
import AuthLoginPage from "@/app/auth/login/page";
import AuthRegisterPage from "@/app/auth/register/page";
import AuthSignupPage from "@/app/auth/signup/page";
import CallbackPage from "@/app/callback/page";
import ChannelPage from "@/app/channel/[id]/page";
import EditChannelPage from "@/app/edit-channel/page";
import EditProfilePage from "@/app/edit-profile/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import HistoryPage from "@/app/history/page";
import LikedVideosPage from "@/app/liked/page";
import LoginPage from "@/app/login/page";
import MyVideosPage from "@/app/my-videos/page";
import PlaylistsPage from "@/app/playlists/page";
import RegisterPage from "@/app/register/page";
import ResetPasswordPage from "@/app/reset-password/page";
import SearchPage from "@/app/search/page";
import SettingsPage from "@/app/settings/page";
import ShortsPage from "@/app/shorts/page";
import SignupPage from "@/app/signup/page";
import SubscriptionsPage from "@/app/subscriptions/page";
import VerifyEmailPage from "@/app/verify-email/page";
import WatchLaterPage from "@/app/watch-later/page";
import WatchPage from "@/app/watch/[id]/page";
import YouPage from "@/app/you/page";

/** A pre-resolved thenable so React 19's `use()` returns synchronously. */
function resolvedParams<T>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  p.status = "fulfilled";
  p.value = value;
  return p;
}

function WatchRoute() {
  const { id = "" } = useParams();
  const params = useMemo(() => resolvedParams({ id }), [id]);
  return <WatchPage key={id} params={params} />;
}

function ChannelRoute() {
  const { id = "" } = useParams();
  const params = useMemo(() => resolvedParams({ id }), [id]);
  return <ChannelPage key={id} params={params} />;
}

function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center px-4">
      <h1 className="text-2xl font-bold">404 — Page not found</h1>
      <a href="#/" className="px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold">
        Go home
      </a>
    </div>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return <RouteError error={this.state.error} reset={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/auth/google/callback" element={<AuthCallbackPage />} />
        <Route path="/auth/google" element={<AuthGoogleRedirectPage />} />
        <Route path="/auth/login" element={<AuthLoginPage />} />
        <Route path="/auth/register" element={<AuthRegisterPage />} />
        <Route path="/auth/signup" element={<AuthSignupPage />} />
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="/channel/:id" element={<ChannelRoute />} />
        <Route path="/edit-channel" element={<EditChannelPage />} />
        <Route path="/edit-profile" element={<EditProfilePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/liked" element={<LikedVideosPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/my-videos" element={<MyVideosPage />} />
        <Route path="/playlists" element={<PlaylistsPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/shorts" element={<ShortsPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/subscriptions" element={<SubscriptionsPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/watch-later" element={<WatchLaterPage />} />
        <Route path="/watch/:id" element={<WatchRoute />} />
        <Route path="/you" element={<YouPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <AppShell>
          <AppRoutes />
        </AppShell>
        <GlobalModals />
      </AppProvider>
    </HashRouter>
  );
}
