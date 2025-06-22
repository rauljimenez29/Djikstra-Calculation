<?php
// NOTE: You must install the Twilio PHP SDK on your server for this to work.
// If you have command-line access, run: composer require twilio/sdk
require_once __DIR__ . '/vendor/autoload.php';

use Twilio\Rest\Client;
use Twilio\Exceptions\TwilioException;

header('Content-Type: application/json');

// --- Get credentials from environment variables ---
$account_sid   = getenv('TWILIO_ACCOUNT_SID');
$auth_token    = getenv('TWILIO_AUTH_TOKEN');
$twilio_number = getenv('TWILIO_PHONE_NUMBER');

// --- Database credentials from environment variables ---
$db_host = getenv('DB_HOST');
$db_user = getenv('DB_USER');
$db_pass = getenv('DB_PASS');
$db_name = getenv('DB_NAME');

// --- Connect to MySQL (or adapt for SQLite if needed) ---
$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);
if ($conn->connect_error) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed: ' . $conn->connect_error]);
    exit();
}

// --- Main Logic ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_POST['nuser_id']) || !isset($_POST['message'])) {
        echo json_encode(['success' => false, 'message' => 'Invalid parameters.']);
        exit();
    }

    $nuserId = $_POST['nuser_id'];
    $message = $_POST['message'];

    // Get contacts for the user
    $stmt = $conn->prepare("SELECT contact_number FROM contacts WHERE nuser_id = ?");
    $stmt->bind_param("i", $nuserId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $contacts = [];
    while ($row = $result->fetch_assoc()) {
        $contacts[] = $row['contact_number'];
    }
    $stmt->close();

    if (empty($contacts)) {
        echo json_encode(['success' => false, 'message' => 'No emergency contacts found for this user.']);
        exit();
    }

    try {
        $client = new Client($account_sid, $auth_token);
    } catch (TwilioException $e) {
        echo json_encode(['success' => false, 'message' => 'Twilio authentication failed.', 'error' => $e->getMessage()]);
        exit();
    }

    $all_sent = true;
    $errors = [];

    foreach ($contacts as $contact_number) {
        try {
            // Make sure the contact number is in E.164 format (e.g., +14155552671)
            // You may need to add logic here to format your numbers correctly.
            $client->messages->create(
                $contact_number,
                [
                    'from' => $twilio_number,
                    'body' => $message
                ]
            );
        } catch (TwilioException $e) {
            $all_sent = false;
            // Provide a more helpful error message
            $errors[] = "Failed to send to {$contact_number}: " . $e->getMessage();
        }
    }

    $conn->close();

    if ($all_sent) {
        echo json_encode(['success' => true, 'message' => 'SOS message sent to all contacts.']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to send SOS to one or more contacts.', 'errors' => $errors]);
    }

} else {
    echo json_encode(['success' => false, 'message' => 'Invalid request method.']);
} 