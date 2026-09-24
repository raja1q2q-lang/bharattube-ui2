import { useEffect } from "react";
/**
 * Vite PREVIEW HARNESS ONLY (this workspace's hosting builds with Vite).
 * The production app is the Next.js App Router in src/app — see vercel.json.
 */
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import { AppShell } from "@/components/Navigation";
import { GlobalModals } from "@/components/Modals";

import HomePage from "@/views/Home";
import WatchPage from "@/views/Watch";
import ChannelPage from "@/views/Channel";
import ShortsPage from "@/views/Shorts";
import SearchPage from "@/views/Search";
import LoginPage from "@/views/Login";
import RegisterPage from "@/views/Register";
import SignupPage from "@/views/Signup";
import ForgotPasswordPage from "@/views/ForgotPassword";
import ResetPasswordPage from "@/views/ResetPassword";
import VerifyEmailPage from "@/views/VerifyEmail";
import SettingsPage from "@/views/Settings";
import YouPageRoute from "@/views/You";
import PlaylistsPage from "@/views/Playlists";
import HistoryPage from "@/views/History";
import LikedVideosPage from "@/views/Liked";
import SubscriptionsPage from "@/views/Subscriptions";
import WatchLaterPage from "@/views/WatchLater";
import MyVideosPage from "@/views/MyVideos";
import EditProfilePage from "@/views/EditProfile";
import EditChannelPage from "@/views/EditChannel";
import GoogleCallbackPage from "@/views/GoogleCallback";
import AuthGoogleRedirectPage from "@/views/AuthGoogleRedirect";
import NotFoundView from "@/views/NotFound";

/** Reset scroll to the top on every route change (Next does this by default). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <ScrollToTop />
        <AppShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/watch/:id" element={<WatchPage />} />
            <Route path="/channel/:id" element={<ChannelPage />} />
            <Route path="/shorts" element={<ShortsPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/you" element={<YouPageRoute />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/liked" element={<LikedVideosPage />} />
            <Route path="/subscriptions" element={<SubscriptionsPage />} />
            <Route path="/watch-later" element={<WatchLaterPage />} />
            <Route path="/my-videos" element={<MyVideosPage />} />
            <Route path="/edit-profile" element={<EditProfilePage />} />
            <Route path="/edit-channel" element={<EditChannelPage />} />
            <Route path="/auth/google" element={<AuthGoogleRedirectPage />} />
            <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
            <Route path="/auth/callback" element={<GoogleCallbackPage />} />
            <Route path="/callback" element={<GoogleCallbackPage />} />
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/register" element={<SignupPage />} />
            <Route path="/auth/signup" element={<SignupPage />} />
            <Route path="*" element={<NotFoundView />} />
          </Routes>
        </AppShell>
        <GlobalModals />
      </AppProvider>
    </HashRouter>
  );
}
