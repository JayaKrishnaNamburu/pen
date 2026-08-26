import type { Unsubscribe } from "@input/pen-types";
import type { EditContext } from "./editContextTypes";

type TextObserver<E> = (event: E) => void;

type ObservableText<E> = {
	observe(observer: TextObserver<E>): void;
	unobserve(observer: TextObserver<E>): void;
};

/**
 * FE1: the listener bookkeeping half of the field-editor lifecycle spine.
 *
 * A backend binds everything it holds while attached — DOM listeners, the
 * EditContext's own listeners, mutation observers, Y.Text observers, editor
 * subscriptions — through one attachment, and `release()` undoes them in the
 * order they were bound. Teardown is total by construction: there is no way
 * to bind without recording the undo, so the hand-mirrored `removeEventListener`
 * block each backend used to carry (and had to keep in sync by eye) is gone.
 *
 * The attachment is deliberately not a lifecycle owner: it does not know
 * about elements, activation order, or what a backend does on attach. It
 * knows how to undo what it was handed.
 */
export class BackendAttachment {
	private releases: Array<() => void> = [];

	/** Listeners bound so far. Teardown tests read this. */
	get size(): number {
		return this.releases.length;
	}

	listen<K extends keyof HTMLElementEventMap>(
		target: HTMLElement,
		type: K,
		handler: (event: HTMLElementEventMap[K]) => void,
		options?: AddEventListenerOptions,
	): void {
		target.addEventListener(type, handler as EventListener, options);
		this.releases.push(() => {
			target.removeEventListener(type, handler as EventListener, options);
		});
	}

	listenDocument<K extends keyof DocumentEventMap>(
		target: Document,
		type: K,
		handler: (event: DocumentEventMap[K]) => void,
	): void {
		target.addEventListener(type, handler as EventListener);
		this.releases.push(() => {
			target.removeEventListener(type, handler as EventListener);
		});
	}

	listenEditContext(
		target: EditContext,
		type: string,
		handler: (event: Event) => void,
	): void {
		target.addEventListener(type, handler);
		this.releases.push(() => {
			target.removeEventListener(type, handler);
		});
	}

	observeMutations(
		element: HTMLElement,
		handler: MutationCallback,
		init: MutationObserverInit,
	): MutationObserver {
		const observer = new MutationObserver(handler);
		observer.observe(element, init);
		this.releases.push(() => observer.disconnect());
		return observer;
	}

	observeText<E>(text: ObservableText<E>, observer: TextObserver<E>): void {
		text.observe(observer);
		this.releases.push(() => text.unobserve(observer));
	}

	subscribe(unsubscribe: Unsubscribe): void {
		this.releases.push(unsubscribe);
	}

	/**
	 * Undo every binding in the order it was made, then forget them, so a
	 * second release is a no-op and a re-attach starts from empty.
	 */
	release(): void {
		const releases = this.releases;
		this.releases = [];
		for (const release of releases) {
			release();
		}
	}
}
