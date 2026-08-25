/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_PLAYGROUND_COLLAB_SERVER_URL?: string;
	readonly VITE_PLAYGROUND_COLLAB_ROOM?: string;
	readonly VITE_PLAYGROUND_COLLAB_USER_NAME?: string;
	readonly VITE_PLAYGROUND_COLLAB_USER_COLOR?: string;
	readonly VITE_PLAYGROUND_AUTOCOMPLETE_DEBUG?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
