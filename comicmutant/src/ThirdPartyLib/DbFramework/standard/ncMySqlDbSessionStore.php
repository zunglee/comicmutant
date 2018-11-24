<?php

/**
 * Provides support for session storage using a MySQL brand database.
 *
 * <b>Required parameters:</b>
 *
 * # <b>db_nodes</b> - [none] - The names of databases for session storage,
 in order of their preference (master, slave1, ...)
 * # <b>db_table</b> - [none] - The database table in which session data will be
 *                              stored.
 *
 * <b>Optional parameters:</b>
 *
 * # <b>db_id_col</b>    - [sess_id]   - The database column in which the
 *                                       session id will be stored.
 * # <b>db_data_col</b>  - [sess_data] - The database column in which the
 *                                       session data will be stored.
 * # <b>db_time_col</b>  - [sess_time] - The database column in which the
 *                                       session timestamp will be stored.
 * # <b>db_id_prefix</b> - [none]      - The string to be prefixed to database id.
 */
class ncMySqlDbSessionStore implements ncDbSessionStore {
  protected $resource = null;
  protected $parameters;

  public function __construct($parameters) {
    $this->parameters = $parameters;
  }

  /**
   * Reads a session.
   *
   * @param string A session ID
   *
   * @return value if id is found, null if id is not found, boolean false on error
   */
  public function get($id) {
    if(!$this->openConnection()) {
      return false;
    }
    // get table/column
    $db_table    = $this->getParameter('db_table');
    $db_data_col = $this->getParameter('db_data_col', 'sess_data');
    $db_id_col   = $this->getParameter('db_id_col', 'sess_id');
    $db_time_col = $this->getParameter('db_time_col', 'sess_time');
    $db_prefix   = $this->getParameter('db_prefix', '');

    $sql = "SELECT `$db_data_col` FROM `$db_table` WHERE `$db_id_col` = ?";
    if ($stmt = $this->resource->prepare($sql)) {
      $stmt->bind_param('s', $id);
      $stmt->execute();
      $result = $stmt->get_result();
      $data = $result->fetch_assoc();
      $dbId = $data[$db_data_col];
      $stmt->close();

      if ($data) {
        return $db_prefix . $dbId;
      } else {
        return null;
      }
    } else {
      return false;
    }
  }

  /**
   * Writes session data.
   *
   * @param string A session ID
   * @param string session data
   *
   * @return boolean true, if the session was written, otherwise false
   *
   */
  public function set($id, $data, $expire=0) {
    if(!$this->openConnection()) {
      return false;
    }
    // get table/column
    $db_table    = $this->getParameter('db_table');
    $db_data_col = $this->getParameter('db_data_col', 'sess_data');
    $db_id_col   = $this->getParameter('db_id_col', 'sess_id');
    $db_time_col = $this->getParameter('db_time_col', 'sess_time');
    $db_prefix   = $this->getParameter('db_prefix');


    if($db_prefix != null) {
      $prefixLen = strlen($db_prefix);

      if(substr_compare($data, $db_prefix, 0, $prefixLen) == 0) {
        $data = substr($data, $prefixLen);
      } else {
        throw new ncDatabaseException("db_id <$data> does not start with db_prefix <$prefix>");
      }
    }

    $sql = "INSERT INTO `$db_table` (`$db_id_col`, `$db_data_col`, `$db_time_col`) VALUES (?, ?, NOW()) 
      ON DUPLICATE KEY UPDATE `$db_time_col` = NOW()";

    if ($stmt = $this->resource->prepare($sql)) {
      $stmt->bind_param('ss', $id, $data);
      $stmt->execute();
      $stmt->close();
      return true;
    } else {
      return false;
    }
  }

  /**
   * Opens a resource.
   *
   * @throws <b>ncDatabaseException</b> If a resource with the database does not exist or cannot be created
   */
  protected function openConnection() {
    $dbNodes = $this->parameters['db_nodes'];
    foreach($dbNodes as $dbNode) {
      try {
        $this->resource = $this->getDatabaseManager()->getDatabase($dbNode)->getResource();
        if($this->resource !== null) {
          return true;
        }
      } catch(Exception $e) {
        // TODO report error
      }
    }
    return false;
  }

  protected function getParameter($key, $default=null) {
    $params = $this->parameters;
    return array_key_exists($key, $params) ? $params[$key] : $default;
  }

  protected function getDatabaseManager() {
    return ncDatabaseManager::getInstance();
  }

  public function cleanup($secondsOld) {
    if(!$this->openConnection()) {
      return false;
    }

    $secondsOld = (int) $secondsOld;
    $db_table    = $this->getParameter('db_table');
    $db_time_col = $this->getParameter('db_time_col', 'sess_time');

    if ($secondsOld > 0) {
      $time = date('Y-m-d H:i:s', time() - $secondsOld);

      $sql = "DELETE FROM `$db_table` WHERE `$db_time_col` < ?";
      if ($stmt = $this->resource->prepare($sql)) {
        $stmt->bind_param('s', $time);
        $stmt->execute();
        $stmt->close();
        return true;
      }
    }
    return false;
  }
}
?>
