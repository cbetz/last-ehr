import "server-only";

import { createAI, createStreamableUI, getMutableAIState } from "ai/rsc";
import OpenAI from "openai";

import {
  spinner,
  BotCard,
  BotMessage,
  SystemMessage,
  Purchase,
  Stocks,
  Patients,
  Events,
} from "@/components/llm-stocks";

import {
  runAsyncFnWithoutBlocking,
  sleep,
  formatNumber,
  runOpenAICompletion,
} from "@/lib/utils";
import { z } from "zod";
import { StockSkeleton } from "@/components/llm-stocks/stock-skeleton";
import { EventsSkeleton } from "@/components/llm-stocks/events-skeleton";
import { StocksSkeleton } from "@/components/llm-stocks/stocks-skeleton";
import { MedplumClient } from "@medplum/core";
import { cookies } from "next/headers";
import { PatientCard } from "@/components/llm-stocks/patient";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

async function confirmPurchase(symbol: string, price: number, amount: number) {
  "use server";

  const aiState = getMutableAIState<typeof AI>();

  const purchasing = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        Purchasing {amount} ${symbol}...
      </p>
    </div>
  );

  const systemMessage = createStreamableUI(null);

  runAsyncFnWithoutBlocking(async () => {
    // You can update the UI at any point.
    await sleep(1000);

    purchasing.update(
      <div className="inline-flex items-start gap-1 md:items-center">
        {spinner}
        <p className="mb-2">
          Purchasing {amount} ${symbol}... working on it...
        </p>
      </div>
    );

    await sleep(1000);

    purchasing.done(
      <div>
        <p className="mb-2">
          You have successfully purchased {amount} ${symbol}. Total cost:{" "}
          {formatNumber(amount * price)}
        </p>
      </div>
    );

    systemMessage.done(
      <SystemMessage>
        You have purchased {amount} shares of {symbol} at ${price}. Total cost ={" "}
        {formatNumber(amount * price)}.
      </SystemMessage>
    );

    aiState.done([
      ...aiState.get(),
      {
        role: "system",
        content: `[User has purchased ${amount} shares of ${symbol} at ${price}. Total cost = ${
          amount * price
        }]`,
      },
    ]);
  });

  return {
    purchasingUI: purchasing.value,
    newMessage: {
      id: Date.now(),
      display: systemMessage.value,
    },
  };
}

async function submitUserMessage(content: string) {
  "use server";

  const aiState = getMutableAIState<typeof AI>();
  aiState.update([
    ...aiState.get(),
    {
      role: "user",
      content,
    },
  ]);

  const reply = createStreamableUI(
    <BotMessage className="items-center">{spinner}</BotMessage>
  );

  const completion = runOpenAICompletion(openai, {
    model: "gpt-3.5-turbo",
    stream: true,
    messages: [
      {
        role: "system",
        content: `\
You are an EHR assistant bot and you can help users lookup information about patients.
You and the user can discuss information in the patient's chart and the user can specify which patient to lookup in the UI.

Messages inside [] means that it's a UI element or a user event. For example:
- "[Price of AAPL = 100]" means that an interface of the stock price of AAPL is shown to the user.
- "[User has changed the amount of AAPL to 10]" means that the user has changed the amount of AAPL to 10 in the UI.

If the user requests to lookup a patient, call \`search_patients\` to show a list of patients that match the search criteria.
If the user requests to lookup a patient by id, call \`show_patient_info_by_id\` to show view a patient's information by id.
If the user wants to complete an impossible task, respond that you are a demo and cannot do that.

Besides that, you can also chat with users.`,
      },
      ...aiState.get().map((info: any) => ({
        role: info.role,
        content: info.content,
        name: info.name,
      })),
    ],
    functions: [
      {
        name: "show_stock_price",
        description:
          "Get the current stock price of a given stock or currency. Use this to show the price to the user.",
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              "The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD."
            ),
          price: z.number().describe("The price of the stock."),
          delta: z.number().describe("The change in price of the stock"),
        }),
      },
      {
        name: "show_stock_purchase_ui",
        description:
          "Show price and the UI to purchase a stock or currency. Use this if the user wants to purchase a stock or currency.",
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              "The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD."
            ),
          price: z.number().describe("The price of the stock."),
          numberOfShares: z
            .number()
            .describe(
              "The **number of shares** for a stock or currency to purchase. Can be optional if the user did not specify it."
            ),
        }),
      },
      {
        name: "search_patients",
        description:
          "Show the UI of a list of patients. Use this if the user wants to search for a patient.",
        parameters: z.object({
          name: z
            .string()
            .describe("The name of the patient e.g. John Doe, Jane Doe, etc."),
        }),
      },
      {
        name: "show_patient_info_by_id",
        description:
          "Show the UI of a patient's details. Use this if the user wants to show a patient's details.",
        parameters: z.object({
          id: z
            .string()
            .describe("The name of the patient e.g. John Doe, Jane Doe, etc."),
        }),
      },
      {
        name: "list_stocks",
        description: "List three imaginary stocks that are trending.",
        parameters: z.object({
          stocks: z.array(
            z.object({
              symbol: z.string().describe("The symbol of the stock"),
              price: z.number().describe("The price of the stock"),
              delta: z.number().describe("The change in price of the stock"),
            })
          ),
        }),
      },
      {
        name: "get_events",
        description:
          "List funny imaginary events between user highlighted dates that describe stock activity.",
        parameters: z.object({
          events: z.array(
            z.object({
              date: z
                .string()
                .describe("The date of the event, in ISO-8601 format"),
              headline: z.string().describe("The headline of the event"),
              description: z.string().describe("The description of the event"),
            })
          ),
        }),
      },
    ],
    temperature: 0,
  });

  completion.onTextContent((content: string, isFinal: boolean) => {
    reply.update(<BotMessage>{content}</BotMessage>);
    if (isFinal) {
      reply.done();
      aiState.done([...aiState.get(), { role: "assistant", content }]);
    }
  });

  completion.onFunctionCall("list_stocks", async ({ stocks }) => {
    reply.update(
      <BotCard>
        <StocksSkeleton />
      </BotCard>
    );

    await sleep(1000);

    reply.done(
      <BotCard>
        <Stocks stocks={stocks} />
      </BotCard>
    );

    aiState.done([
      ...aiState.get(),
      {
        role: "function",
        name: "list_stocks",
        content: JSON.stringify(stocks),
      },
    ]);
  });

  completion.onFunctionCall("get_events", async ({ events }) => {
    reply.update(
      <BotCard>
        <EventsSkeleton />
      </BotCard>
    );

    await sleep(1000);

    reply.done(
      <BotCard>
        <Events events={events} />
      </BotCard>
    );

    aiState.done([
      ...aiState.get(),
      {
        role: "function",
        name: "get_events",
        content: JSON.stringify(events),
      },
    ]);
  });

  completion.onFunctionCall(
    "show_stock_purchase_ui",
    ({ symbol, price, numberOfShares = 100 }) => {
      if (numberOfShares <= 0 || numberOfShares > 1000) {
        reply.done(<BotMessage>Invalid amount</BotMessage>);
        aiState.done([
          ...aiState.get(),
          {
            role: "function",
            name: "show_stock_purchase_ui",
            content: `[Invalid amount]`,
          },
        ]);
        return;
      }

      reply.done(
        <>
          <BotMessage>
            Sure!{" "}
            {typeof numberOfShares === "number"
              ? `Click the button below to purchase ${numberOfShares} shares of $${symbol}:`
              : `How many $${symbol} would you like to purchase?`}
          </BotMessage>
          <BotCard showAvatar={false}>
            <Purchase
              defaultAmount={numberOfShares}
              name={symbol}
              price={+price}
            />
          </BotCard>
        </>
      );
      aiState.done([
        ...aiState.get(),
        {
          role: "function",
          name: "show_stock_purchase_ui",
          content: `[UI for purchasing ${numberOfShares} shares of ${symbol}. Current price = ${price}, total cost = ${
            numberOfShares * price
          }]`,
        },
      ]);
    }
  );

  completion.onFunctionCall("search_patients", async ({ name }) => {
    if (name === " ") {
      reply.done(<BotMessage>Invalid name</BotMessage>);
      aiState.done([
        ...aiState.get(),
        {
          role: "function",
          name: "search_patients",
          content: `[Invalid name]`,
        },
      ]);
      return;
    }

    try {
      const cookieStore = cookies();
      const accessToken = cookieStore.get("medplum_access_token");
      const medplum = new MedplumClient({
        accessToken: accessToken?.value,
      });

      const bundle = await medplum.search("Patient", `name=${name}`);

      reply.done(
        <>
          <BotMessage>
            {"Choose a patient from the list below to view their information."}
          </BotMessage>
          <BotCard showAvatar={false}>
            <Patients patients={bundle.entry!} />
          </BotCard>
        </>
      );
      aiState.done([
        ...aiState.get(),
        {
          role: "function",
          name: "search_patients",
          content: `[UI for showing patient ${name}.]`,
        },
      ]);
    } catch (error) {
      console.error(error);
    }
  });

  completion.onFunctionCall("show_patient_info_by_id", async ({ id }) => {
    const cookieStore = cookies();
    const accessToken = cookieStore.get("medplum_access_token");
    const medplum = new MedplumClient({
      accessToken: accessToken?.value,
    });

    if (id === "") {
      reply.done(<BotMessage>Invalid name</BotMessage>);
      aiState.done([
        ...aiState.get(),
        {
          role: "function",
          name: "show_patient_info_by_id",
          content: `[Invalid name]`,
        },
      ]);
      return;
    }

    const patient = await medplum.readResource("Patient", id);
    console.log(patient);

    reply.done(
      <>
        <BotMessage>
          {"Here is the information for the patient you requested."}
        </BotMessage>
        <BotCard showAvatar={false}>
          <PatientCard patient={patient} />
        </BotCard>
      </>
    );
    aiState.done([
      ...aiState.get(),
      {
        role: "function",
        name: "search_patients",
        content: `[UI for showing patient ${name}.]`,
      },
    ]);
  });

  return {
    id: Date.now(),
    display: reply.value,
  };
}

// Define necessary types and create the AI.

const initialAIState: {
  role: "user" | "assistant" | "system" | "function";
  content: string;
  id?: string;
  name?: string;
}[] = [];

const initialUIState: {
  id: number;
  display: React.ReactNode;
}[] = [];

export const AI = createAI({
  actions: {
    submitUserMessage,
    confirmPurchase,
  },
  initialUIState,
  initialAIState,
});
