import ForceLightTheme from "@/components/ForceLightTheme";

export default function PacketLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
