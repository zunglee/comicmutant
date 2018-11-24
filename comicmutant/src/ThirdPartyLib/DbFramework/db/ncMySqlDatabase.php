<?php
class ncMySqlDatabase extends ncDatabase
{
  private $host;
  private $database;
  private $username;
  private $password;
  private $persistent;

  public function __construct($database, $host, $username, $password, $persistent=false)
  {
    $this->database = $database;
    $ncDnsResolver = new ncDnsResolver();
    $host = $ncDnsResolver->resolveDNS($host, false);
    $this->host = trim($host, ";");
    $this->username = $username;
    $this->password = $password;
    $this->persistent = $persistent;
  }

  public function connect()
  {
    $database = $this->database;
    list($host, $port) = explode(':', $this->host);
    $port = ($port) ?: 3306;
    $password = $this->password;
    $username = $this->username;

    $driver = new mysqli_driver();
    $driver->report_mode = MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT;

    try {
      if($this->persistent)
      {
        $this->connection = new mysqli("p:$host", $username, $password, $database, $port);
      }
      else
      {
        $this->connection = new mysqli($host, $username, $password, $database, $port);
      }
    }
    catch (mysqli_sql_exception $e)
    {
      throw new ncDatabaseException($e->getMessage() . "[host: $host:$port]");
    }

    $this->resource = $this->connection;
  }

  public function shutdown()
  {
    if ($this->connection != null)
    {
      $this->connection->close();
    }
  }
}
