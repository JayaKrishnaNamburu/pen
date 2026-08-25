import { useState } from "react";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Icon } from "../ui/Icon";
import { ApiKeyModal } from "./ApiKeyModal";

/**
 * The overflow control on the agent bar, same shape as Input's agent "more"
 * menu: icon, dropdown, then a modal for the one setting.
 */
export function ChatMore({ onNewChat }: { onNewChat: () => void }) {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isKeyOpen, setIsKeyOpen] = useState(false);

	const startNewChat = () => {
		setIsMenuOpen(false);
		onNewChat();
	};

	const openKey = () => {
		setIsMenuOpen(false);
		setIsKeyOpen(true);
	};

	return (
		<div className="chat-bar-more">
			<Dropdown
				open={isMenuOpen}
				onOpenChange={setIsMenuOpen}
				align="end"
				width={200}
				content={
					<>
						<Dropdown.Item onClick={startNewChat}>
							New Chat
						</Dropdown.Item>
						<Dropdown.Item onClick={openKey}>
							Anthropic API Key
						</Dropdown.Item>
					</>
				}
			>
				<Button.Tooltip content="More" disabled={isMenuOpen}>
					<Button.Icon
						label="More"
						active={isMenuOpen}
						onClick={() => setIsMenuOpen((open) => !open)}
					>
						<Icon.More />
					</Button.Icon>
				</Button.Tooltip>
			</Dropdown>
			<ApiKeyModal open={isKeyOpen} onClose={() => setIsKeyOpen(false)} />
		</div>
	);
}
