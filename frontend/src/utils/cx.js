import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names and handles Tailwind CSS collisions.
 * @param inputs - The class names to merge.
 * @returns The merged class names.
 */
export function cx(...inputs) {
    return twMerge(clsx(inputs));
}