"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface LoginScreenProps {
  onLogin: (password: string) => boolean;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    if (onLogin(password)) {
      setError("");
      return;
    }
    setError("パスワードを入力してください");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm rounded-[20px] border-0 bg-white shadow-none">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#f0f0f0]">
            <Lock className="size-6 text-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">MyRoom</CardTitle>
          <CardDescription>お部屋の状態をモニタリング</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">パスワード</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="rounded-xl border-border bg-background"
            />
          </div>
          {error && (
            <p className={cn("rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive")}>
              {error}
            </p>
          )}
          <Button
            className="h-12 w-full rounded-xl bg-foreground text-base text-white hover:bg-foreground/90"
            onClick={handleLogin}
          >
            ログイン
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
