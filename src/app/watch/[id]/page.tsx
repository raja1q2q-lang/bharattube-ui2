import WatchPage from "@/views/Watch";

// The dynamic segment is read client-side with useParams() inside the view.

/** Server Component route entry — renders the interactive BharatTube view. */
export default function Page() {
  return <WatchPage />;
}
