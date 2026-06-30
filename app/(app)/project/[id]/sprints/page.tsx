"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";

// The Sprint view now lives on the board page as `?view=sprint` so it shares the
// same URL shape as List/Board. This legacy route just redirects there.
export default function SprintsRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  useEffect(() => {
    router.replace(`/?project=${id}&view=sprint`);
  }, [id, router]);

  return (
    <div className="page-loading">
      <Spinner />
    </div>
  );
}
