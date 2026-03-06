import { describe, it, expect } from "vitest";
import { prop } from "../prop.js";

describe("prop builder", () => {
  it("prop.string() produces correct schema", () => {
    expect(prop.string().toSchema()).toEqual({ type: "string", default: "" });
  });

  it("prop.string() with chaining", () => {
    expect(
      prop.string().default("hello").describe("A title").toSchema(),
    ).toEqual({
      type: "string",
      default: "hello",
      description: "A title",
    });
  });

  it("prop.number() with min/max", () => {
    expect(prop.number().min(0).max(100).toSchema()).toEqual({
      type: "number",
      default: 0,
      minimum: 0,
      maximum: 100,
    });
  });

  it("prop.boolean() produces correct schema", () => {
    expect(prop.boolean().toSchema()).toEqual({
      type: "boolean",
      default: false,
    });
  });

  it("prop.enum() with string values", () => {
    expect(prop.enum(["bar", "line", "pie"]).toSchema()).toEqual({
      type: "string",
      default: "bar",
      enum: ["bar", "line", "pie"],
    });
  });

  it("prop.enum() with number values", () => {
    expect(prop.enum([1, 2, 3, 4, 5, 6]).toSchema()).toEqual({
      type: "number",
      default: 1,
      enum: [1, 2, 3, 4, 5, 6],
    });
  });

  it("prop.array() produces correct schema", () => {
    expect(prop.array(prop.string()).toSchema()).toEqual({
      type: "array",
      default: [],
      items: { type: "string", default: "" },
    });
  });

  it("prop.object() produces correct schema with computed defaults", () => {
    expect(prop.object({ x: prop.number() }).toSchema()).toEqual({
      type: "object",
      default: { x: 0 },
      properties: { x: { type: "number", default: 0 } },
    });
  });

  it("prop.optional() wraps type with null", () => {
    expect(prop.optional(prop.string()).toSchema()).toEqual({
      type: ["string", "null"],
      default: "",
    });
  });

  it("prop.json() produces empty schema", () => {
    expect(prop.json().toSchema()).toEqual({});
  });

  it("JSON.stringify works via toJSON()", () => {
    const json = JSON.stringify(prop.string());
    expect(JSON.parse(json)).toEqual({ type: "string", default: "" });
  });

  it("chaining is fluent — same instance returned", () => {
    const chain = prop.number();
    const chained = chain.min(0).max(100).default(50);
    expect(chained).toBe(chain);
  });
});
