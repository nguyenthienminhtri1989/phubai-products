// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth"; // Import từ file auth.ts vừa tạo
export const { GET, POST } = handlers;
