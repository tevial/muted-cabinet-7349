/** Compose static and conditional Tailwind class strings without adding a dependency. */
export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ')
