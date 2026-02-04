import Image from "next/image";

export default function Home() {
  return (
    <div>
      <h1>Welcome to NEXTJS App.</h1>
      <Image src="/nextjs-logo.png" alt="Logo" width={301} height={168}></Image>
    </div>
  );
}
