import { Kafka } from "kafkajs";

const kafkaBroker = process.env.KAFKA_BROKER || "localhost:9092";

// Initialize Kafka client
const kafka = new Kafka({
  clientId: "college-erp",
  brokers: [kafkaBroker],
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: "college-erp-group" });

let isProducerConnected = false;
let isConsumerConnected = false;

/**
 * Initializes connections for both the Kafka producer and background consumer.
 */
export const initKafka = async () => {
  try {
    await producer.connect();
    isProducerConnected = true;
    console.log("Kafka Producer connected successfully.");

    await consumer.connect();
    isConsumerConnected = true;
    console.log("Kafka Consumer connected successfully.");

    // Subscribe background consumer to the alerts topic
    await consumer.subscribe({ topic: "college-erp-alerts", fromBeginning: true });

    // Start background event listener loop
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const eventPayload = JSON.parse(message.value.toString());
        console.log(`[Kafka Consumer] Received background event from topic "${topic}":`, eventPayload);

        // Simulate asynchronous background operations (e.g., mail sending, push notifications)
        if (eventPayload.type === "NOTICE_CREATED") {
          console.log(
            `[Background Worker] Dispatching push notification alerts to all "${eventPayload.data.noticeFor}" students for topic: "${eventPayload.data.topic}"`
          );
        } else if (eventPayload.type === "STUDENT_REGISTERED") {
          console.log(
            `[Background Worker] Sending credentials welcome email to student: ${eventPayload.data.email} (${eventPayload.data.username})`
          );
        }
      },
    });
  } catch (error) {
    console.warn("Could not connect to Kafka. Event streaming will run in fallback/log-only mode:", error.message);
  }
};

/**
 * Publishes a structured event message to a Kafka topic.
 * @param {string} topic Target message broker topic
 * @param {object} payload Event data containing type and attributes
 */
export const publishEvent = async (topic, payload) => {
  if (!isProducerConnected) {
    console.log(`[Kafka Fallback Log] Event logged locally (Broker Offline):`, payload);
    return;
  }
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(payload) }],
    });
    console.log(`[Kafka Producer] Published event to topic "${topic}"`);
  } catch (error) {
    console.error("Error publishing event to Kafka:", error.message);
  }
};
