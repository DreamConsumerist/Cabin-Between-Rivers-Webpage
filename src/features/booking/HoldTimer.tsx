import { useEffect, useState } from "react";
import type { FunctionComponent } from "../../common/types";

type HoldTimerProps = {
	holdExpiresAt: string;
	onExpire: () => void;
};

const formatRemaining = (ms: number): string => {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const HoldTimer = ({ holdExpiresAt, onExpire }: HoldTimerProps): FunctionComponent => {
	const [remainingMs, setRemainingMs] = useState(
		() => new Date(holdExpiresAt).getTime() - Date.now()
	);

	useEffect(() => {
		const interval = setInterval(() => {
			const next = new Date(holdExpiresAt).getTime() - Date.now();
			setRemainingMs(next);
			if (next <= 0) {
				clearInterval(interval);
				onExpire();
			}
		}, 1000);
		return (): void => { clearInterval(interval); };
	}, [holdExpiresAt, onExpire]);

	return (
		<p className="text-sm text-neutral-500">
			Dates held for{" "}
			<span className="font-medium text-brand-700">{formatRemaining(remainingMs)}</span>
		</p>
	);
};
