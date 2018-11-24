<?php

namespace Zunglee\ComicBundle\Dao;

/**
 * Description of IDBConnectionFactory
 *
 * @author ankitesh
 */
interface IDBConnectionFactory {

    public function getDBConnection($dbTag);
}
