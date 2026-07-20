import React from "react";
import "./ArabesqueBand.css";

type ArabesqueBandProps = {
  children: React.ReactNode;
  className?: string;
  density?: "light" | "classic" | "dense";
};

export function ArabesqueBand({
  children,
  className = "",
  density = "classic",
}: ArabesqueBandProps) {
  return (
    <section
      className={`arabesque-stage arabesque-stage--${density} ${className}`}
    >
      {children}
    </section>
  );
}
