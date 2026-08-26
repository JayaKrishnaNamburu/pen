import { PenEditor } from "@input/pen-react";

// Server Component (no "use client"). HOST1 puts the client boundary on
// @input/pen-react's published entries, so this import is legal in App Router.
export default function Page() {
	return <PenEditor editor={undefined as never} />;
}
