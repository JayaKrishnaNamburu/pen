/**
 * Input's IntelligenceLoader — the 3×3 of dots that sat in the agent status
 * slot before the orb. Pulse is the variant that loader defaulted to; the
 * playground only needs that one.
 *
 * The nine cells collapse to three roles (corner, edge, centre), so three
 * keyframe sets in `ui.css` cover the whole grid.
 */
const CELL_ROLES = [
	"corner",
	"edge",
	"corner",
	"edge",
	"center",
	"edge",
	"corner",
	"edge",
	"corner",
] as const;

const DOTS = CELL_ROLES.map((role, index) => (
	<span key={index} className="agent-loader-dot" data-role={role} />
));

export function AgentLoader() {
	return (
		<span className="agent-loader" role="status" aria-label="Loading">
			{DOTS}
		</span>
	);
}
