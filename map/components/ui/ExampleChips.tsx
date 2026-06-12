"use client";

export type ExampleChipsProps = {
  items: string[];
  onPick: (item: string) => void;
};

// takes: a list of example labels and an onPick callback
// does: renders a row of pill buttons; clicking one hands its label to the
//       caller, which fills the search and fires the action
// returns: the chip row element
export default function ExampleChips({ items, onPick }: ExampleChipsProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        justifyContent: "center",
      }}
    >
      {items.map((item) => (
        <button key={item} className="tk-chip" onClick={() => onPick(item)}>
          {item}
        </button>
      ))}
    </div>
  );
}
